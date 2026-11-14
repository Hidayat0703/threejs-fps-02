// The match: one place holds the round state, the money, the spike and the score.
// Buy phase (8 s, shop open) -> live (100 s) -> round end (banner) -> next round.
// First to 5 rounds takes the match; the spike is the objective that decides rounds
// kills alone cannot. Money: $300 a kill, $325 a round win, $300 a round loss or a plant.
import { WEAPONS, GRENADE, ARMOR } from './weapons.js';

const BUY_SECONDS = 8;
const ROUND_SECONDS = 100;
const PLANT_SECONDS = 3.5;
const DEFUSE_SECONDS = 5;
const FUSE_SECONDS = 35;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;

export function createRounds(ctx) {
  const state = {
    phase: 'buy',
    round: 1,
    phaseLeft: BUY_SECONDS,
    attackWins: 0,
    defendWins: 0,
    money: 800,
    kills: 0,
    deaths: 0,
    spike: { planted: false, site: null, x: 0, z: 0, dropped: false, carrier: 'YOU', fuseLeft: 0 },
    plant: { active: false, by: null, progress: 0 },
    defuse: { active: false, by: null, progress: 0 },
    banner: null,
    matchWinner: null,
  };

  function money(delta) {
    state.money = Math.max(0, state.money + delta);
    ctx.hud.setMoney(state.money);
  }

  function startRound() {
    state.phase = 'buy';
    state.phaseLeft = BUY_SECONDS;
    state.spike = { planted: false, site: null, x: 0, z: 0, dropped: false, carrier: 'YOU', fuseLeft: 0 };
    state.plant = { active: false, by: null, progress: 0 };
    state.defuse = { active: false, by: null, progress: 0 };
    ctx.bots.spawnAll();
    ctx.player.spawnAt(...ctx.spawnFor('attack'), Math.PI);
    ctx.weapon.refill();
    ctx.hud.setRound(state.round, state.attackWins, state.defendWins);
    ctx.hud.setMoney(state.money);
    ctx.hud.showBuy(true);
    ctx.hud.banner(`ROUND ${state.round}`, 'Buy phase — B opens the shop, E plants the spike');
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.phase = 'end';
    state.phaseLeft = 4.5;
    state.plant.active = false;
    state.defuse.active = false;
    if (winner === 'attack') {
      state.attackWins += 1;
      money(325);
      ctx.audio.roundWin();
    } else {
      state.defendWins += 1;
      money(300);
      ctx.audio.roundLose();
    }
    const title = winner === 'attack' ? 'SANDLINE TAKES THE ROUND' : 'DUSK HOLDS THE ROUND';
    ctx.hud.setRound(state.round, state.attackWins, state.defendWins);
    ctx.hud.banner(title, reason);
    ctx.hud.showBuy(false);
    if (state.attackWins >= WIN_ROUNDS || state.defendWins >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'match';
      state.matchWinner = state.attackWins > state.defendWins ? 'attack' : 'defend';
      const matchTitle = state.matchWinner === 'attack' ? 'SANDLINE WINS THE MATCH' : 'DUSK WINS THE MATCH';
      ctx.hud.banner(matchTitle, `${state.attackWins} — ${state.defendWins}. Click to play again.`);
      ctx.hud.showOverlay('match', state);
    }
  }

  function step(dt) {
    if (state.phase === 'match') return;
    state.phaseLeft -= dt;
    if (state.phase === 'buy') {
      ctx.hud.setTimer(Math.ceil(state.phaseLeft), true);
      if (state.phaseLeft <= 0) {
        state.phase = 'live';
        state.phaseLeft = ROUND_SECONDS;
        ctx.hud.showBuy(false);
        ctx.hud.banner('', '');
      }
      return;
    }
    if (state.phase === 'live') {
      // Spike fuse runs past the round timer.
      if (state.spike.planted) {
        state.spike.fuseLeft -= dt;
        ctx.hud.setTimer(Math.ceil(state.spike.fuseLeft), false, true);
        if (state.spike.fuseLeft <= 0) {
          endRound('attack', 'The spike detonated at site ' + state.spike.site + '.');
          return;
        }
      } else {
        ctx.hud.setTimer(Math.ceil(Math.max(0, state.phaseLeft)), false);
        if (state.phaseLeft <= 0) {
          endRound('defend', 'Time ran out with the spike unplanted.');
          return;
        }
      }
      // Elimination decides the round.
      if (ctx.bots.aliveCount('attack') === 0 && !ctx.playerAlive()) {
        endRound('defend', 'SANDLINE was eliminated.');
        return;
      }
      if (ctx.bots.aliveCount('defend') === 0) {
        endRound('attack', 'DUSK was eliminated.');
        return;
      }
      // Player plant channel.
      if (state.plant.active && state.plant.by === 'YOU') {
        state.plant.progress += dt / PLANT_SECONDS;
        ctx.hud.setChannel('plant', state.plant.progress);
        if (state.plant.progress >= 1) {
          state.plant.active = false;
          ctx.hud.setChannel(null, 0);
          plantSpike('YOU');
        }
      }
      if (state.defuse.active && state.defuse.by === 'YOU') {
        state.defuse.progress += dt / DEFUSE_SECONDS;
        ctx.hud.setChannel('defuse', state.defuse.progress);
        if (state.defuse.progress >= 1) {
          state.defuse.active = false;
          ctx.hud.setChannel(null, 0);
          endRound('defend', 'YOU defused the spike.');
        }
      }
      return;
    }
    if (state.phase === 'end') {
      if (state.phaseLeft <= 0) {
        state.round += 1;
        startRound();
      }
    }
  }

  function plantSpike(by) {
    const site = nearSite();
    if (!site) return false;
    state.spike.planted = true;
    state.spike.site = site;
    state.spike.x = ctx.world[site === 'A' ? 'siteA' : 'siteB'].x;
    state.spike.z = ctx.world[site === 'A' ? 'siteA' : 'siteB'].z;
    state.spike.dropped = false;
    state.spike.carrier = null;
    state.spike.fuseLeft = FUSE_SECONDS;
    state.phaseLeft = FUSE_SECONDS;
    if (by === 'YOU') {
      money(300);
      ctx.audio.plantBeep();
    }
    ctx.hud.banner('SPIKE PLANTED — SITE ' + site, 'DUSK has ' + FUSE_SECONDS + ' seconds to defuse.');
    ctx.hud.setSpike(true, site);
    return true;
  }

  function nearSite() {
    const p = ctx.playerPos();
    if (Math.hypot(p.x - ctx.world.siteA.x, p.z - ctx.world.siteA.z) < 3.6) return 'A';
    if (Math.hypot(p.x - ctx.world.siteB.x, p.z - ctx.world.siteB.z) < 3.6) return 'B';
    return null;
  }

  function buy(kind) {
    if (state.phase !== 'buy') return 'The shop is closed — buy during the buy phase.';
    if (kind === 'grenade') {
      if (state.money < GRENADE.price) return 'Not enough money for a frag.';
      money(-GRENADE.price);
      ctx.weapon.addGrenade();
      ctx.audio.buy();
      ctx.hud.setGrenades(ctx.weapon.state.grenades);
      return null;
    }
    if (kind === 'armor') {
      if (state.money < ARMOR.price) return 'Not enough money for kevlar.';
      money(-ARMOR.price);
      ctx.player.state.armor = 100;
      ctx.audio.buy();
      return null;
    }
    const def = WEAPONS[kind];
    if (!def) return 'Unknown item.';
    if (state.money < def.price) return `Not enough money for the ${def.name}.`;
    money(-def.price);
    ctx.weapon.equip(kind);
    ctx.audio.buy();
    ctx.hud.setWeapon(def.name);
    ctx.hud.setAmmo(ctx.weapon.state.mag, ctx.weapon.state.reserve);
    return null;
  }

  return {
    state,
    startRound,
    step,
    buy,
    plantSpike,
    nearSite,
    // Player holds E: start/stop the plant or defuse channel.
    plantStart() {
      if (state.phase !== 'live' || state.spike.planted || state.spike.carrier !== 'YOU') return;
      if (!nearSite()) return;
      state.plant = { active: true, by: 'YOU', progress: 0 };
    },
    plantStop() {
      if (state.plant.active && state.plant.by === 'YOU') {
        state.plant.active = false;
        ctx.hud.setChannel(null, 0);
      }
    },
    defuseStart() {
      if (state.phase !== 'live' || !state.spike.planted) return;
      const p = ctx.playerPos();
      if (Math.hypot(p.x - state.spike.x, p.z - state.spike.z) > 3.0) return;
      state.defuse = { active: true, by: 'YOU', progress: 0 };
    },
    defuseStop() {
      if (state.defuse.active && state.defuse.by === 'YOU') {
        state.defuse.active = false;
        ctx.hud.setChannel(null, 0);
      }
    },
    // Bot callbacks, wired through main.js.
    botPlantStart(site) {
      if (state.phase !== 'live' || state.spike.planted) return;
      state.plant = { active: true, by: 'bot', progress: 0 };
    },
    botPlantDone() {
      state.plant.active = false;
      plantSpike('bot');
    },
    botDefuseStart() {
      if (state.phase !== 'live' || !state.spike.planted) return;
      state.defuse = { active: true, by: 'bot', progress: 0 };
    },
    botDefuseDone(name) {
      state.defuse.active = false;
      endRound('defend', name + ' defused the spike.');
    },
    channelProgress(kind, frac, name) {
      if (kind === 'plant') state.plant.progress = frac;
      else state.defuse.progress = frac;
      ctx.hud.setChannel(kind, frac, name);
    },
    dropSpike(x, z) {
      if (state.spike.planted || state.spike.carrier !== 'YOU') return;
      state.spike.dropped = true;
      state.spike.x = x;
      state.spike.z = z;
      ctx.hud.setSpikeCarrier('DROPPED');
    },
    pickupSpike(name) {
      state.spike.dropped = false;
      state.spike.carrier = name;
      ctx.hud.setSpikeCarrier(name);
    },
    onKill(killer, victim) {
      if (killer === 'YOU') {
        state.kills += 1;
        money(300);
      }
      if (victim === 'YOU') state.deaths += 1;
      ctx.hud.killfeed(killer, victim);
    },
    restart() {
      state.round = 1;
      state.attackWins = 0;
      state.defendWins = 0;
      state.money = 800;
      state.kills = 0;
      state.deaths = 0;
      state.matchWinner = null;
      ctx.player.state.armor = 0;
      ctx.weapon.equip('rifle');
      ctx.hud.setWeapon('VK-47 Rifle');
      ctx.hud.setKills(0, 0);
      startRound();
    },
  };
}
