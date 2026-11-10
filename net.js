/* ==========================================================================
   NET.JS — Multijoueur local (WebSocket) : voir server.js à la racine.
   Principe : chaque machine simule SON char (et, pour l'hôte, les bots) et
   diffuse son état ~20 fois par seconde. Les autres chars sont des NetTank :
   des copies visuelles lissées. Les obus sont diffusés puis simulés partout ;
   seule la machine propriétaire d'un char applique réellement les dégâts.
   Actif uniquement si ARENA_CFG.mode === "multi". Chargé après arena-combat.js.
   ========================================================================== */
console.log("[TankArena] chargement : net.js");

const Net = (function () {
  const N = { on: false, ws: null, id: null, host: false, hostId: null, team: "A", cfg: null, peers: new Map(), welcome: null };
  const send = o => { if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(o)); };
  const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
  const find = id => id === N.id ? localTank : (N.peers.get(id) || null);
  const note = txt => { try { HUD.toast(txt); } catch (e) { } };
  let botSeq = 0, tickN = 0;

  /* ───── Copie distante d'un char (joueur ou bot de l'hôte) ───── */
  class NetTank extends Tank {
    constructor(info) {
      const key = TANK_MODULES[info.key] ? info.key : selectedKey, sp = getSpawnPoint(info.team, 0, 6);
      super(sp.x, sp.y, TANK_MODULES[key], info.team, key);
      this.remote = true; this.netId = info.id; this._playerName = info.name || key; this.isEnemy = info.team !== teamId;
      this.alphaTank = this.pAT = sp.heading; this.alphaTurret = this.pATu = sp.heading - Math.PI / 2;
      this._net = null; this.setTeam(info.team);
    }
    live() {
      this.px = this.x; this.py = this.y; this.pAT = this.alphaTank; this.pATu = this.alphaTurret; this.pEl = this.gunElevation;
      this.recoilOffset *= 0.82;
      if (this.destroyed) { this.speed *= 0.9; this.wreckTimer++; this._pose(); return; }
      const s = this._net;
      if (s) {
        const dx = s.x + Math.sin(s.a) * s.sp * 4 - this.x, dy = s.y - Math.cos(s.a) * s.sp * 4 - this.y;
        if (Math.hypot(dx, dy) > 900) { this.x = s.x; this.y = s.y; } else { this.x += dx * 0.3; this.y += dy * 0.3; }
        this.alphaTank += wrapAngle(s.a - this.alphaTank) * 0.35;
        this.alphaTurret += wrapAngle(s.tu - this.alphaTurret) * 0.45;
        this.gunElevation += (s.el - this.gunElevation) * 0.35;
        this.speed = s.sp; this.engineHealth = s.hp;
      }
      this.angularVelocity = wrapAngle(this.alphaTank - this.pAT);
      this._pose();
      if (this._firedTimer > 0) this._firedTimer--;
    }
    /* Les dégâts sont décidés par la machine du propriétaire : ici, impact visuel seulement */
    takeShellHit(shell) {
      FX.impact(shell.x * PX, shell.z * PX, shell.y * PX, "blocked"); playImpactSound("blocked", shell.x, shell.y);
    }
  }

  function addPeer(info) {
    if (!info || N.peers.has(info.id) || info.id === N.id) return;
    N.peers.set(info.id, null);                      // réservé pendant le chargement du modèle
    const key = TANK_MODULES[info.key] ? info.key : selectedKey;
    Promise.resolve(TankModels.loadModelFor(key)).catch(() => { }).then(() => {
      if (!N.peers.has(info.id)) return;             // parti entre-temps
      N.peers.set(info.id, new NetTank(info));
    });
  }
  function dropPeer(id) {
    const t = N.peers.get(id); N.peers.delete(id);
    if (t) { t.kill(); if (t.view) World.S.scene.remove(t.view.root); }
  }

  /* ───── Connexion (avant la création du monde : le thème de carte vient de l'hôte) ───── */
  N.connect = function () {
    return new Promise((resolve, reject) => {
      const server = (ARENA_CFG.net && ARENA_CFG.net.server) || location.host;
      let ws, done = false;
      const fail = msg => { if (done) return; done = true; clearTimeout(to); try { ws.close(); } catch (e) { } reject(new Error(msg)); };
      try { ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + server); } catch (e) { return reject(new Error("Adresse du serveur invalide : " + server)); }
      const to = setTimeout(() => fail("Serveur multijoueur injoignable (" + server + "). Lancez « node server.js » sur le PC hôte."), 6000);
      N.ws = ws;
      ws.onopen = () => send({ t: "join", name: localStorage.getItem("PlayerName") || "Joueur", key: selectedKey, cfg: { theme: MAP_THEME, allies: ARENA_CFG.allies, enemies: ARENA_CFG.enemies, difficulty: ARENA_CFG.difficulty, scoreToWin: ARENA_CFG.scoreToWin, respawnBots: ARENA_CFG.respawnBots } });
      ws.onerror = () => fail("Connexion impossible à " + server);
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === "welcome" && !done) {
          done = true; clearTimeout(to);
          N.id = m.id; N.team = m.team; N.host = m.host; N.hostId = m.hostId; N.cfg = m.cfg || {}; N.welcome = m; N.on = true;
          // la salle impose sa carte : si elle diffère de celle chargée, on recharge avec la bonne
          if (N.cfg.theme && N.cfg.theme !== MAP_THEME && !sessionStorage.getItem("netReload")) {
            sessionStorage.setItem("netReload", "1");
            const c = JSON.parse(localStorage.getItem("arenaConfig") || "{}"); c.theme = N.cfg.theme; localStorage.setItem("arenaConfig", JSON.stringify(c));
            ws.onclose = null; ws.close(); location.reload(); return;
          }
          sessionStorage.removeItem("netReload");
          if (!N.host) { for (const k of ["allies", "enemies", "difficulty", "scoreToWin", "respawnBots"]) if (N.cfg[k] !== undefined) ARENA_CFG[k] = N.cfg[k]; }
          resolve(m);
        } else onMsg(m);
      };
      ws.onclose = () => { if (!done) fail("Connexion fermée par le serveur"); else if (N.on) { N.on = false; note("Connexion au serveur perdue — la partie continue en local"); } };
    });
  };

  /* Après la création du joueur local : crée les copies des autres joueurs */
  N.populate = function () {
    teamId = N.team; localTank.netId = N.id;
    Rules.scoreToWin = ARENA_CFG.scoreToWin || Rules.scoreToWin;
    for (const p of N.welcome.players) addPeer(p);
    note(N.host ? "Vous êtes l'hôte de la partie" : "Partie rejointe — équipe " + N.team);
  };
  N.regBot = function (bot) { if (!N.on || !N.host) return; bot.netId = "b" + (botSeq++); N.peers.set(bot.netId, bot); };
  function botList() { const l = []; for (const [id, t] of N.peers) if (t && id[0] === "b") l.push({ id, key: t._tankKey, team: t.teamId, name: t._playerName }); return l; }

  /* ───── Émissions ───── */
  N.tick = function () {
    if (!N.on || ++tickN % 3) return;
    const l = [], add = t => {
      if (!t || t.destroyed || t.remote || !t.netId) return;
      const fl = (t.modules.trackLeft ? 0 : 1) | (t.modules.trackRight ? 0 : 2) | (t.int && t.int.fire ? 4 : 0);
      l.push([t.netId, r1(t.x), r1(t.y), r3(t.alphaTank), r3(t.alphaTurret), r3(t.gunElevation * Math.PI / 180), r3(t.speed), fl, Math.round(t.engineHealth)]);
    };
    add(localTank);
    if (N.host) for (const [id, t] of N.peers) if (t && id[0] === "b") add(t);
    if (l.length) send({ t: "s", l });
  };
  N.shot = function (owner, o, ammo, vel) {
    if (!N.on || !owner.netId) return;
    send({ t: "shot", id: owner.netId, a: ammo, x: r1(o.x), y: r1(o.y), z: r1(o.z), dx: r3(o.dx), dy: r3(o.dy), dz: r3(o.dz), vx: r3(vel ? vel.x : 0), vy: r3(vel ? vel.y : 0) });
  };
  N.dead = function (tank, killer, big) { if (N.on && tank.netId) send({ t: "dead", id: tank.netId, by: killer && killer.netId || null, big: !!big }); };
  N.resp = function (t) { if (N.on && t.netId) send({ t: "resp", id: t.netId, x: r1(t.x), y: r1(t.y), a: r3(t.alphaTank) }); };

  /* ───── Réceptions ───── */
  function onMsg(m) {
    switch (m.t) {
      case "join": addPeer(m.p); note(m.p.name + " a rejoint (équipe " + m.p.team + ")"); if (N.host) send({ t: "bots", to: m.p.id, l: botList(), sc: teamScore }); break;
      case "leave": { const t = N.peers.get(m.id); if (t) note((t._playerName || "Un joueur") + " a quitté la partie"); dropPeer(m.id); break; }
      case "bots": for (const b of m.l || []) addPeer(b); if (m.sc && !N.host) { teamScore.A = m.sc.A; teamScore.B = m.sc.B; } break;
      case "host": N.hostId = m.id; if (m.id === N.id) becomeHost(); break;
      case "s": for (const e of m.l) {
        const t = N.peers.get(e[0]); if (!t || t.destroyed || !t.remote) continue;
        const s = { x: e[1], y: e[2], a: e[3], tu: e[4], el: e[5] * 180 / Math.PI, sp: e[6], hp: e[8] };
        if (!t._net) { t.x = t.px = s.x; t.y = t.py = s.y; t.alphaTank = t.pAT = s.a; t.alphaTurret = t.pATu = s.tu; }
        t._net = s; t.modules.trackLeft = !(e[7] & 1); t.modules.trackRight = !(e[7] & 2); if (t.int) t.int.fire = !!(e[7] & 4);
      } break;
      case "shot": {
        const sh = N.peers.get(m.id); if (!sh || !sh.remote || sh.destroyed) break;
        new Shell({ x: m.x, y: m.y, z: m.z, dx: m.dx, dy: m.dy, dz: m.dz, net: true }, m.a, sh, sh._tankModules, { x: m.vx, y: m.vy });
        const data = getAmmoData(m.a, sh._tankModules); sh.recoilOffset = Math.min(0.9, data.caliber * 0.0075); sh._firedTimer = 180;
        FX.muzzleFlash(m.x * PX, m.z * PX, m.y * PX, m.dx, m.dz, m.dy, data.caliber); playFireSound(m.x, m.y, data.caliber);
        break;
      }
      case "dead": { const t = N.peers.get(m.id); if (!t || !t.remote || t.destroyed) break; t._lastHitBy = m.by ? find(m.by) : null; t._destroyTank(!!m.big); break; }
      case "resp": {
        const t = N.peers.get(m.id); if (!t || !t.remote) break;
        t.destroyed = false; t.speed = 0; t.wreckTimer = 0; t.reload = 0; t.spotted = false;
        t.x = t.px = m.x; t.y = t.py = m.y; t.alphaTank = t.pAT = m.a; t.alphaTurret = t.pATu = m.a - Math.PI / 2; t._net = { x: m.x, y: m.y, a: m.a, tu: m.a - Math.PI / 2, el: 0, sp: 0, hp: 100 };
        t.resetModules(); t.view.setDestroyed(false);
        break;
      }
    }
  }
  /* L'hôte est parti : ce poste reprend les bots (les copies deviennent de vrais chars pilotés par l'IA) */
  function becomeHost() {
    N.host = true; note("Vous êtes maintenant l'hôte");
    for (const [id, t] of N.peers) if (t && id[0] === "b") {
      Object.setPrototypeOf(t, Tank.prototype); t.remote = false; t._net = null; t._slot = Math.floor(Math.random() * 6); t._n = 6; t.isEnemy = t.teamId !== teamId;
      createBotAI(t); botSeq = Math.max(botSeq, +id.slice(1) + 1);
    }
  }

  /* Diffuse les réapparitions (joueur local et bots) */
  const _rl = respawnLocalPlayer, _rb = respawnBot;
  respawnLocalPlayer = function () { _rl(); if (N.on) N.resp(localTank); };
  respawnBot = function (b) { _rb(b); if (N.on && !b.remote) N.resp(b); };

  return N;
})();
