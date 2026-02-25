'use strict';
// ============================================================
// AGE OF EMPIRES II - WEB EDITION
// ============================================================

// ===== CONSTANTS =====
const TILE_SIZE = 48;
const MAP_W = 80, MAP_H = 80;
const T = { GRASS:0, TREE:1, GOLD:2, STONE:3, BERRY:4, WATER:5, FARM:6, DEPLETED:7 };
const TCOLOR = ['#5a8a3c','#2d5a1c','#d4af37','#888','#7a3a8a','#1e4fa8','#8a6a2c','#444'];
const TEMOJI = {[T.TREE]:'🌲',[T.GOLD]:'💛',[T.STONE]:'⬜',[T.BERRY]:'🫐',[T.WATER]:'〰️'};
const AGES = ['Dark Age','Feudal Age','Castle Age','Imperial Age'];
const AGE_COST = [{},{food:500,wood:500},{food:800,gold:200},{food:1000,gold:800}];

// Unit types
const UT = { VILLAGER:'VILLAGER', MILITIA:'MILITIA', ARCHER:'ARCHER', KNIGHT:'KNIGHT' };
const UNIT_DEF = {
  VILLAGER: { emoji:'🧑', hp:25, speed:80, attack:3, attackRange:1.2, attackRate:2000, cost:{food:50}, trainTime:25000, pop:1 },
  MILITIA:  { emoji:'⚔️', hp:40, speed:90, attack:8, attackRange:1.4, attackRate:1500, cost:{food:60,gold:20}, trainTime:21000, pop:1 },
  ARCHER:   { emoji:'🏹', hp:30, speed:100, attack:6, attackRange:5.0, attackRate:1800, cost:{wood:25,gold:45}, trainTime:27000, pop:1 },
  KNIGHT:   { emoji:'🐴', hp:100, speed:110, attack:12, attackRange:1.5, attackRate:1800, cost:{food:60,gold:75}, trainTime:30000, pop:1 }
};

// Building types
const BT = { TOWN_CENTER:'TOWN_CENTER', HOUSE:'HOUSE', BARRACKS:'BARRACKS', LUMBER_CAMP:'LUMBER_CAMP', MINING_CAMP:'MINING_CAMP', FARM:'FARM' };
const BDEF = {
  TOWN_CENTER:  { emoji:'🏰', size:4, hp:2400, cost:{}, popCap:0 },
  HOUSE:        { emoji:'🏠', size:2, hp:550,  cost:{wood:25}, popCap:5 },
  BARRACKS:     { emoji:'🪓', size:3, hp:1200, cost:{wood:175} },
  LUMBER_CAMP:  { emoji:'🪵', size:2, hp:600,  cost:{wood:100} },
  MINING_CAMP:  { emoji:'⛏️', size:2, hp:600,  cost:{wood:100} },
  FARM:         { emoji:'🌾', size:3, hp:100,  cost:{wood:60} }
};

let game = null;

// ===== UTILITIES =====
function rnd(a,b){ return a + Math.random()*(b-a); }
function clamp(v,lo,hi){ return Math.max(lo,Math.min(hi,v)); }
function dist(ax,ay,bx,by){ const dx=bx-ax, dy=by-ay; return Math.sqrt(dx*dx+dy*dy); }
function tileToWorld(tx,ty){ return [tx*TILE_SIZE + TILE_SIZE/2, ty*TILE_SIZE + TILE_SIZE/2]; }
function worldToTile(wx,wy){ return [Math.floor(wx/TILE_SIZE), Math.floor(wy/TILE_SIZE)]; }
function canAfford(res, cost){
  for(const k in cost) if((res[k]||0) < cost[k]) return false;
  return true;
}
function deductCost(res, cost){
  for(const k in cost) res[k] = (res[k]||0) - cost[k];
}

let _uid = 1;
function uid(){ return _uid++; }

// ===== MAP GENERATION =====
function generateMap(){
  const map = [];
  for(let y=0;y<MAP_H;y++){ map[y]=[]; for(let x=0;x<MAP_W;x++) map[y][x]={type:T.GRASS,amount:0,id:uid()}; }
  // Water patches
  for(let i=0;i<6;i++){
    const cx=Math.floor(rnd(5,MAP_W-5)), cy=Math.floor(rnd(5,MAP_H-5));
    const r=Math.floor(rnd(2,5));
    for(let y=cy-r;y<=cy+r;y++) for(let x=cx-r;x<=cx+r;x++){
      if(x>=0&&x<MAP_W&&y>=0&&y<MAP_H&&dist(cx,cy,x,y)<=r&&!(x<8&&y<8)&&!(x>MAP_W-9&&y>MAP_H-9))
        map[y][x].type=T.WATER;
    }
  }
  // Trees
  for(let i=0;i<500;i++){
    const x=Math.floor(rnd(0,MAP_W)),y=Math.floor(rnd(0,MAP_H));
    if(map[y][x].type===T.GRASS&&!nearStart(x,y)){ map[y][x].type=T.TREE; map[y][x].amount=150; }
  }
  // Gold clusters
  for(let i=0;i<8;i++){
    const cx=Math.floor(rnd(8,MAP_W-8)),cy=Math.floor(rnd(8,MAP_H-8));
    for(let j=0;j<6;j++){
      const x=cx+Math.floor(rnd(-2,3)),y=cy+Math.floor(rnd(-2,3));
      if(x>=0&&x<MAP_W&&y>=0&&y<MAP_H&&map[y][x].type===T.GRASS&&!nearStart(x,y)){ map[y][x].type=T.GOLD; map[y][x].amount=800; }
    }
  }
  // Stone clusters
  for(let i=0;i<8;i++){
    const cx=Math.floor(rnd(8,MAP_W-8)),cy=Math.floor(rnd(8,MAP_H-8));
    for(let j=0;j<5;j++){
      const x=cx+Math.floor(rnd(-2,3)),y=cy+Math.floor(rnd(-2,3));
      if(x>=0&&x<MAP_W&&y>=0&&y<MAP_H&&map[y][x].type===T.GRASS&&!nearStart(x,y)){ map[y][x].type=T.STONE; map[y][x].amount=600; }
    }
  }
  // Berries
  for(let i=0;i<12;i++){
    const x=Math.floor(rnd(0,MAP_W)),y=Math.floor(rnd(0,MAP_H));
    if(map[y][x].type===T.GRASS&&!nearStart(x,y)){ map[y][x].type=T.BERRY; map[y][x].amount=400; }
  }
  return map;
}
function nearStart(x,y){ return (x<8&&y<8)||(x>MAP_W-9&&y>MAP_H-9); }

// ===== ENTITY =====
class Entity {
  constructor(owner, x, y){ this.id=uid(); this.owner=owner; this.x=x; this.y=y; this.dead=false; }
}

// ===== UNIT =====
class Unit extends Entity {
  constructor(owner, type, x, y){
    super(owner,x,y);
    this.type = type;
    const d = UNIT_DEF[type];
    this.hp = d.hp; this.maxHp = d.hp;
    this.speed = d.speed; this.attack = d.attack;
    this.attackRange = d.attackRange; this.attackRate = d.attackRate;
    this.lastAttack = 0;
    // States: IDLE, MOVE, GATHER, GATHER_RETURN, ATTACK, BUILD
    this.state = 'IDLE';
    this.targetX = x; this.targetY = y;
    this.targetEntity = null; // enemy unit/building to attack
    this.targetTile = null;   // resource tile {tx,ty}
    this.gatherTarget = null;
    this.dropoffBuilding = null;
    this.carrying = 0; this.carryType = null; this.carryMax = 20;
    this.gatherTimer = 0; this.gatherRate = 1500; // ms per gather cycle
    this.selected = false;
    this.path = []; this.pathIdx = 0;
    this.constructTarget = null;
  }
  getEmoji(){ return UNIT_DEF[this.type].emoji; }
}

// ===== BUILDING =====
class Building extends Entity {
  constructor(owner, type, tx, ty){
    const d = BDEF[type];
    const [wx,wy] = tileToWorld(tx + d.size/2 - 0.5, ty + d.size/2 - 0.5);
    super(owner, wx, wy);
    this.type = type; this.tx = tx; this.ty = ty;
    this.maxHp = d.hp; this.hp = d.hp;
    this.selected = false;
    this.trainQueue = []; this.trainTimer = 0;
    this.constructProgress = 1.0; // 1.0 = complete
    this.rallyX = wx; this.rallyY = wy + TILE_SIZE * d.size;
    this.farmTimer = 0;
  }
  getSize(){ return BDEF[this.type].size; }
  getEmoji(){ return BDEF[this.type].emoji; }
  isComplete(){ return this.constructProgress >= 1.0; }
}

// ===== PATHFINDING (simple grid BFS) =====
function findPath(game, sx, sy, ex, ey, maxDist=200){
  const [stx,sty] = worldToTile(sx,sy);
  const [etx,ety] = worldToTile(ex,ey);
  if(stx===etx&&sty===ety) return [];
  const queue = [[stx,sty,0]];
  const visited = new Map();
  visited.set(stx+','+sty, null);
  const limit = 300;
  let found = false;
  while(queue.length){
    const [cx,cy] = queue.shift();
    if(cx===etx&&cy===ety){ found=true; break; }
    if(visited.size>limit) break;
    for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const nx=cx+dx, ny=cy+dy;
      const k=nx+','+ny;
      if(nx<0||ny<0||nx>=MAP_W||ny>=MAP_H||visited.has(k)) continue;
      const tile=game.map[ny][nx];
      if(tile.type===T.WATER) continue;
      // Check building occupancy (except destination)
      if(!(nx===etx&&ny===ety)&&game.getBuildingAt(nx,ny)) continue;
      visited.set(k,[cx,cy]);
      queue.push([nx,ny,visited.size]);
    }
  }
  if(!found) return [];
  // Reconstruct path
  const path = [];
  let cur = etx+','+ety;
  while(visited.get(cur)!==null){
    const [px,py] = cur.split(',').map(Number);
    const [wx,wy] = tileToWorld(px,py);
    path.unshift({wx,wy,tx:px,ty:py});
    const prev = visited.get(cur);
    cur = prev[0]+','+prev[1];
  }
  return path;
}


// ===== GAME STATE =====
class GameState {
  constructor(){
    this.map = generateMap();
    this.units = [];
    this.buildings = [];
    this.selected = []; // selected entity ids
    this.buildMode = null; // {type: BT.*}
    this.camera = { x:0, y:0, zoom:1.0 };
    this.canvas = null; this.ctx = null;
    this.minimap = null; this.mctx = null;
    this.paused = false;
    this.gameOver = false;
    this.lastTime = 0;
    this.keys = {};
    this.age = 0; // 0=Dark,1=Feudal,2=Castle,3=Imperial
    this.resources = { food:200, wood:200, gold:100, stone:100 };
    this.pop = 0; this.popCap = 10;
    this.aiResources = { food:500, wood:500, gold:200, stone:200 };
    this.aiPop = 0; this.aiPopCap = 10;
    this.aiTimer = 0; this.aiGatherTimer = 0;
    this.aiState = 'ECONOMY';
    this.aiAge = 0;
    this.notifications = [];
    this.selBox = null; // {x0,y0,x1,y1} in screen coords
    this.selBoxStart = null;
    this.minimapDragging = false;
    this.frameId = null;
  }

  getBuildingAt(tx,ty){
    for(const b of this.buildings){
      const s=b.getSize();
      if(tx>=b.tx&&tx<b.tx+s&&ty>=b.ty&&ty<b.ty+s) return b;
    }
    return null;
  }

  getEntityById(id){
    return this.units.find(u=>u.id===id) || this.buildings.find(b=>b.id===id) || null;
  }

  getSelectedEntities(){
    const ids = new Set(this.selected);
    return [...this.units,...this.buildings].filter(e=>ids.has(e.id));
  }

  getSelectedUnits(){
    const ids = new Set(this.selected);
    return this.units.filter(u=>ids.has(u.id));
  }

  calcPopCap(owner){
    let cap = 10;
    for(const b of this.buildings){
      if(b.owner===owner&&b.isComplete()){
        cap += (BDEF[b.type].popCap||0);
        if(b.type===BT.TOWN_CENTER) cap += 5;
      }
    }
    return Math.min(cap,200);
  }

  calcPop(owner){
    return this.units.filter(u=>u.owner===owner).length;
  }

  getDropoff(owner, type){
    // Returns closest drop-off building for resource type
    const valid = this.buildings.filter(b=>{
      if(b.owner!==owner||!b.isComplete()) return false;
      if(type==='wood') return b.type===BT.LUMBER_CAMP||b.type===BT.TOWN_CENTER;
      if(type==='food') return b.type===BT.FARM||b.type===BT.TOWN_CENTER;
      if(type==='gold'||type==='stone') return b.type===BT.MINING_CAMP||b.type===BT.TOWN_CENTER;
      return b.type===BT.TOWN_CENTER;
    });
    return valid[0] || null;
  }

  notify(msg, color='#f0c040'){
    this.notifications.push({msg, color, t:0});
  }

  spendResources(owner, cost){
    if(owner===0){ deductCost(this.resources,cost); }
    else { deductCost(this.aiResources,cost); }
  }

  placeBuilding(owner, type, tx, ty, complete=false){
    const b = new Building(owner,type,tx,ty);
    if(complete){ b.constructProgress=1.0; b.hp=BDEF[type].hp; }
    else { b.constructProgress=0.1; b.hp=Math.ceil(BDEF[type].hp*0.1); }
    this.buildings.push(b);
    // Mark tiles blocked
    return b;
  }

  spawnUnit(owner, type, nearX, nearY){
    const pop = this.calcPop(owner);
    const cap = this.calcPopCap(owner);
    if(pop>=cap) return null;
    // Find open tile near spawn point
    const [btx,bty] = worldToTile(nearX,nearY);
    for(let r=0;r<8;r++){
      for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++){
        if(Math.abs(dx)!==r&&Math.abs(dy)!==r) continue;
        const tx=btx+dx, ty=bty+dy;
        if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) continue;
        if(this.map[ty][tx].type===T.WATER||this.getBuildingAt(tx,ty)) continue;
        const [wx,wy]=tileToWorld(tx,ty);
        const u = new Unit(owner,type,wx,wy);
        this.units.push(u);
        return u;
      }
    }
    return null;
  }

  isTilePassable(tx,ty){
    if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return false;
    if(this.map[ty][tx].type===T.WATER) return false;
    if(this.getBuildingAt(tx,ty)) return false;
    return true;
  }

  getEnemyBuildings(owner){
    return this.buildings.filter(b=>b.owner!==owner&&!b.dead);
  }

  getEnemyUnits(owner){
    return this.units.filter(u=>u.owner!==owner&&!u.dead);
  }
}


// ===== UPDATE =====
function updateGame(g, dt){
  if(g.paused||g.gameOver) return;
  const ms = dt*1000;

  // Update population
  g.pop = g.calcPop(0);
  g.popCap = g.calcPopCap(0);
  g.aiPop = g.calcPop(1);
  g.aiPopCap = g.calcPopCap(1);

  // Update buildings
  for(const b of g.buildings){
    if(b.dead) continue;

    // Farms produce food
    if(b.type===BT.FARM&&b.isComplete()&&b.owner===0){
      b.farmTimer += ms;
      if(b.farmTimer >= 3000){ g.resources.food += 5; b.farmTimer=0; }
    }
    if(b.type===BT.FARM&&b.isComplete()&&b.owner===1){
      b.farmTimer += ms;
      if(b.farmTimer >= 3000){ g.aiResources.food += 5; b.farmTimer=0; }
    }

    // Training queue
    if(b.trainQueue.length>0&&b.isComplete()){
      b.trainTimer += ms;
      const unitType = b.trainQueue[0];
      const trainTime = UNIT_DEF[unitType].trainTime;
      if(b.trainTimer >= trainTime){
        b.trainTimer = 0;
        b.trainQueue.shift();
        g.spawnUnit(b.owner, unitType, b.rallyX, b.rallyY);
        if(b.owner===0) g.notify('Unit trained: '+unitType.toLowerCase());
      }
    }
  }

  // Update units
  for(const u of g.units){
    if(u.dead) continue;
    updateUnit(g, u, dt, ms);
  }

  // Remove dead entities
  g.units = g.units.filter(u=>!u.dead);
  g.buildings = g.buildings.filter(b=>!b.dead);

  // Check win/loss
  checkEndConditions(g);

  // Notifications
  for(const n of g.notifications) n.t += ms;
  g.notifications = g.notifications.filter(n=>n.t<3500);

  // AI
  updateAI(g, dt, ms);

  // HUD
  updateHUD(g);
}

function updateUnit(g, u, dt, ms){
  if(u.state==='MOVE'||u.state==='GATHER'||u.state==='GATHER_RETURN'||u.state==='ATTACK'||u.state==='BUILD'){
    // Follow path
    if(u.path&&u.path.length>0){
      const wp = u.path[0];
      const dx = wp.wx - u.x, dy = wp.wy - u.y;
      const d = Math.sqrt(dx*dx+dy*dy);
      const spd = UNIT_DEF[u.type].speed;
      if(d < spd*dt+2){
        u.x = wp.wx; u.y = wp.wy;
        u.path.shift();
      } else {
        u.x += (dx/d)*spd*dt;
        u.y += (dy/d)*spd*dt;
      }
    }
  }

  // State machine
  if(u.state==='ATTACK'){
    const target = u.targetEntity ? g.units.find(x=>x.id===u.targetEntity)||g.buildings.find(x=>x.id===u.targetEntity) : null;
    if(!target||target.dead){ u.state='IDLE'; u.targetEntity=null; u.path=[]; return; }
    const range = UNIT_DEF[u.type].attackRange * TILE_SIZE;
    const d = dist(u.x,u.y,target.x,target.y);
    if(d > range+4){
      if(u.path.length===0){
        u.path = findPath(g,u.x,u.y,target.x,target.y);
      }
    } else {
      u.path=[];
      const now = performance.now();
      if(now - u.lastAttack >= UNIT_DEF[u.type].attackRate){
        u.lastAttack = now;
        target.hp -= UNIT_DEF[u.type].attack;
        if(target.hp<=0){ target.dead=true; u.state='IDLE'; u.targetEntity=null; }
      }
    }
  }

  else if(u.state==='GATHER'){
    const tt = u.targetTile;
    if(!tt){ u.state='IDLE'; return; }
    const tile = g.map[tt.ty][tt.tx];
    if(tile.type===T.DEPLETED||tile.amount<=0){ tile.type=T.DEPLETED; u.state='IDLE'; return; }
    const [twx,twy] = tileToWorld(tt.tx,tt.ty);
    const d = dist(u.x,u.y,twx,twy);
    if(d > TILE_SIZE*1.8){
      if(u.path.length===0) u.path=findPath(g,u.x,u.y,twx,twy);
    } else {
      u.path=[];
      if(u.carrying >= u.carryMax){
        // Return to drop-off
        u.state='GATHER_RETURN';
        const db = g.getDropoff(u.owner, u.carryType);
        if(db){ u.path=findPath(g,u.x,u.y,db.x,db.y); u.dropoffBuilding=db.id; }
        else u.state='IDLE';
      } else {
        u.gatherTimer += ms;
        if(u.gatherTimer >= u.gatherRate){
          u.gatherTimer=0;
          const amt=Math.min(5, tile.amount);
          u.carrying += amt;
          tile.amount -= amt;
          if(tile.amount<=0) tile.type=T.DEPLETED;
        }
      }
    }
  }

  else if(u.state==='GATHER_RETURN'){
    const db = g.buildings.find(b=>b.id===u.dropoffBuilding);
    if(!db||db.dead){ u.state='IDLE'; return; }
    const d = dist(u.x,u.y,db.x,db.y);
    if(d>TILE_SIZE*2.5){
      if(u.path.length===0) u.path=findPath(g,u.x,u.y,db.x,db.y);
    } else {
      u.path=[];
      if(u.owner===0) g.resources[u.carryType]=(g.resources[u.carryType]||0)+u.carrying;
      else g.aiResources[u.carryType]=(g.aiResources[u.carryType]||0)+u.carrying;
      u.carrying=0;
      // Go back to resource
      if(u.targetTile){
        const tt=u.targetTile;
        const tile=g.map[tt.ty][tt.tx];
        if(tile.type===T.DEPLETED||tile.amount<=0){ u.state='IDLE'; return; }
        u.state='GATHER';
        const [twx,twy]=tileToWorld(tt.tx,tt.ty);
        u.path=findPath(g,u.x,u.y,twx,twy);
      } else { u.state='IDLE'; }
    }
  }

  else if(u.state==='BUILD'){
    const target = g.buildings.find(b=>b.id===u.constructTarget);
    if(!target||target.dead||target.isComplete()){ u.state='IDLE'; u.constructTarget=null; return; }
    const d=dist(u.x,u.y,target.x,target.y);
    if(d>TILE_SIZE*(target.getSize()/2+1.5)){
      if(u.path.length===0) u.path=findPath(g,u.x,u.y,target.x,target.y);
    } else {
      u.path=[];
      target.constructProgress = Math.min(1.0, target.constructProgress + dt/15);
      target.hp = Math.ceil(target.maxHp * target.constructProgress);
      if(target.isComplete()){ u.state='IDLE'; u.constructTarget=null; }
    }
  }

  else if(u.state==='MOVE'){
    if(u.path.length===0){ u.state='IDLE'; }
  }
}

function checkEndConditions(g){
  if(g.gameOver) return;
  const playerTC = g.buildings.find(b=>b.owner===0&&b.type===BT.TOWN_CENTER&&!b.dead);
  const aiBuildings = g.buildings.filter(b=>b.owner===1&&!b.dead);
  if(!playerTC){ endGame(g, false); }
  else if(aiBuildings.length===0){ endGame(g, true); }
}

function endGame(g, victory){
  g.gameOver=true;
  g.paused=true;
  document.getElementById('end-title').textContent = victory ? '🏆 Victory!' : '💀 Defeat!';
  document.getElementById('end-message').textContent = victory
    ? 'You destroyed all enemy buildings!'
    : 'Your Town Center was destroyed.';
  document.getElementById('end-screen').classList.remove('hidden');
}


// ===== AI =====
function updateAI(g, dt, ms){
  g.aiTimer += ms;
  g.aiGatherTimer += ms;

  // AI villagers auto-gather
  if(g.aiGatherTimer >= 2000){
    g.aiGatherTimer=0;
    const aiVillagers = g.units.filter(u=>u.owner===1&&u.type===UT.VILLAGER&&u.state==='IDLE');
    for(const v of aiVillagers){
      assignGatherer(g, v, 1);
    }
  }

  if(g.aiTimer < 4000) return;
  g.aiTimer=0;

  const aiUnits = g.units.filter(u=>u.owner===1);
  const aiBuildings = g.buildings.filter(b=>b.owner===1&&!b.dead);
  const aiBuildingsComplete = aiBuildings.filter(b=>b.isComplete());
  const aiTC = aiBuildingsComplete.find(b=>b.type===BT.TOWN_CENTER);
  const aiBarracks = aiBuildingsComplete.find(b=>b.type===BT.BARRACKS);
  const aiVillagers = aiUnits.filter(u=>u.type===UT.VILLAGER);
  const aiMilitary = aiUnits.filter(u=>u.type!==UT.VILLAGER);
  const aiRes = g.aiResources;

  // Train villagers
  if(aiTC&&aiVillagers.length<6&&g.aiPop<g.aiPopCap&&aiTC.trainQueue.length<3){
    if(canAfford(aiRes,UNIT_DEF.VILLAGER.cost)){
      deductCost(aiRes,UNIT_DEF.VILLAGER.cost);
      aiTC.trainQueue.push(UT.VILLAGER);
    }
  }

  // Build house if pop approaching cap
  if(g.aiPop >= g.aiPopCap-2 && g.aiPopCap<200){
    if(canAfford(aiRes,BDEF.HOUSE.cost)){
      const spot = findBuildSpot(g,1,2);
      if(spot){ deductCost(aiRes,BDEF.HOUSE.cost); const b=g.placeBuilding(1,BT.HOUSE,spot.tx,spot.ty); sendVillagerToBuild(g,1,b); }
    }
  }

  // Build barracks
  if(!aiBarracks&&!aiBuildings.find(b=>b.type===BT.BARRACKS)&&aiRes.wood>=175){
    const spot=findBuildSpot(g,1,3);
    if(spot){ aiRes.wood-=175; const b=g.placeBuilding(1,BT.BARRACKS,spot.tx,spot.ty); sendVillagerToBuild(g,1,b); }
  }

  // Train military from barracks
  if(aiBarracks&&g.aiPop<g.aiPopCap&&aiBarracks.trainQueue.length<3){
    if(canAfford(aiRes,UNIT_DEF.MILITIA.cost)){
      deductCost(aiRes,UNIT_DEF.MILITIA.cost);
      aiBarracks.trainQueue.push(UT.MILITIA);
    }
  }

  // Attack when enough military
  if(aiMilitary.length>=5){
    g.aiState='ATTACK';
    const playerBuildings = g.buildings.filter(b=>b.owner===0&&!b.dead);
    if(playerBuildings.length>0){
      const target = playerBuildings[0];
      for(const m of aiMilitary){
        if(m.state==='IDLE'||m.state==='MOVE'){
          m.targetEntity=target.id;
          m.state='ATTACK';
          m.path=findPath(g,m.x,m.y,target.x,target.y);
        }
      }
    }
  }
}

function assignGatherer(g, v, owner){
  // Find nearest resource
  const [vtx,vty]=worldToTile(v.x,v.y);
  let best=null, bestD=9999;
  const types=[T.TREE,T.GOLD,T.STONE,T.BERRY];
  for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++){
    const tile=g.map[y][x];
    if(types.includes(tile.type)&&tile.amount>0){
      const d=dist(vtx,vty,x,y);
      if(d<bestD){ bestD=d; best={tx:x,ty:y,tile}; }
    }
  }
  if(!best) return;
  const typeMap={[T.TREE]:'wood',[T.GOLD]:'gold',[T.STONE]:'stone',[T.BERRY]:'food'};
  v.carryType=typeMap[best.tile.type];
  v.targetTile={tx:best.tx,ty:best.ty};
  v.state='GATHER';
  v.carrying=0;
  const [twx,twy]=tileToWorld(best.tx,best.ty);
  v.path=findPath(g,v.x,v.y,twx,twy);
}

function findBuildSpot(g, owner, size){
  // Find a spot near the AI town center
  const tc = g.buildings.find(b=>b.owner===owner&&b.type===BT.TOWN_CENTER);
  if(!tc) return null;
  const [btx,bty]=worldToTile(tc.x,tc.y);
  for(let r=3;r<20;r++){
    for(let dx=-r;dx<=r;dx++) for(let dy=-r;dy<=r;dy++){
      if(Math.abs(dx)!==r&&Math.abs(dy)!==r) continue;
      const tx=btx+dx, ty=bty+dy;
      if(tx<0||ty<0||tx+size>MAP_W||ty+size>MAP_H) continue;
      let ok=true;
      for(let sx=0;sx<size&&ok;sx++) for(let sy=0;sy<size&&ok;sy++){
        const tile=g.map[ty+sy][tx+sx];
        if(tile.type===T.WATER||tile.type===T.TREE||g.getBuildingAt(tx+sx,ty+sy)) ok=false;
      }
      if(ok) return {tx,ty};
    }
  }
  return null;
}

function sendVillagerToBuild(g, owner, building){
  const v=g.units.find(u=>u.owner===owner&&u.type===UT.VILLAGER&&u.state==='IDLE');
  if(v){ v.state='BUILD'; v.constructTarget=building.id; v.path=findPath(g,v.x,v.y,building.x,building.y); }
}


// ===== RENDERING =====
function renderGame(g){
  const canvas=g.canvas, ctx=g.ctx;
  const W=canvas.width, H=canvas.height;
  const cam=g.camera;
  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(-cam.x*cam.zoom, -cam.y*cam.zoom);
  ctx.scale(cam.zoom, cam.zoom);

  const ts=TILE_SIZE;
  // Viewport in tile coords
  const startTX=Math.floor(cam.x/ts), startTY=Math.floor(cam.y/ts);
  const endTX=Math.ceil((cam.x+W/cam.zoom)/ts)+1, endTY=Math.ceil((cam.y+H/cam.zoom)/ts)+1;
  const csx=Math.max(0,startTX), csy=Math.max(0,startTY);
  const cex=Math.min(MAP_W,endTX), cey=Math.min(MAP_H,endTY);

  // Draw tiles
  ctx.font=`${Math.floor(ts*0.55)}px serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  for(let ty=csy;ty<cey;ty++) for(let tx=csx;tx<cex;tx++){
    const tile=g.map[ty][tx];
    ctx.fillStyle=TCOLOR[tile.type]||TCOLOR[0];
    ctx.fillRect(tx*ts,ty*ts,ts,ts);
    const emoji=TEMOJI[tile.type];
    if(emoji&&tile.type!==T.DEPLETED){
      ctx.fillText(emoji,tx*ts+ts/2,ty*ts+ts/2);
    }
    // Grid (subtle)
    if(cam.zoom>=0.8){
      ctx.strokeStyle='rgba(0,0,0,0.08)';
      ctx.lineWidth=0.5/cam.zoom;
      ctx.strokeRect(tx*ts,ty*ts,ts,ts);
    }
  }

  // Draw buildings
  for(const b of g.buildings){
    if(b.dead) continue;
    const s=b.getSize()*ts;
    const bx=b.tx*ts, by=b.ty*ts;
    // Check visibility
    if(bx+s<cam.x||by+s<cam.y||bx>cam.x+W/cam.zoom||by>cam.y+H/cam.zoom) continue;
    const isPlayer=b.owner===0;
    // Shadow
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.fillRect(bx+4,by+4,s,s);
    // Body
    if(!b.isComplete()){
      ctx.fillStyle=isPlayer?'rgba(100,150,100,0.5)':'rgba(150,80,80,0.5)';
    } else {
      ctx.fillStyle=isPlayer?'#8b7355':'#6b3535';
    }
    ctx.fillRect(bx,by,s,s);
    // Border
    ctx.strokeStyle=isPlayer?'#c8a060':'#c84040';
    ctx.lineWidth=2/cam.zoom;
    if(g.selected.includes(b.id)){ ctx.strokeStyle='#80ff80'; ctx.lineWidth=3/cam.zoom; }
    ctx.strokeRect(bx,by,s,s);
    // Emoji
    const eSize=Math.floor(s*0.55);
    ctx.font=`${eSize}px serif`;
    const opacity=b.isComplete()?1:0.4+b.constructProgress*0.5;
    ctx.globalAlpha=opacity;
    ctx.fillText(b.getEmoji(),bx+s/2,by+s/2);
    ctx.globalAlpha=1;
    // HP bar
    drawHPBar(ctx,bx,by-8/cam.zoom,s,6/cam.zoom,b.hp/b.maxHp,isPlayer?'#4aff4a':'#ff4a4a');
    // Build progress
    if(!b.isComplete()){
      ctx.fillStyle='rgba(255,200,0,0.7)';
      ctx.fillRect(bx, by+s+2/cam.zoom, s*b.constructProgress, 4/cam.zoom);
    }
    // Train queue progress
    if(b.trainQueue.length>0&&b.isComplete()){
      const prog=b.trainTimer/UNIT_DEF[b.trainQueue[0]].trainTime;
      ctx.fillStyle='rgba(100,200,255,0.7)';
      ctx.fillRect(bx, by+s+2/cam.zoom, s*prog, 4/cam.zoom);
    }
  }

  // Draw units
  ctx.font=`${Math.floor(ts*0.5)}px serif`;
  for(const u of g.units){
    if(u.dead) continue;
    const ux=u.x, uy=u.y, r=ts*0.38;
    if(ux+r<cam.x||uy+r<cam.y||ux-r>cam.x+W/cam.zoom||uy-r>cam.y+H/cam.zoom) continue;
    const isPlayer=u.owner===0;
    // Shadow
    ctx.beginPath(); ctx.ellipse(ux+2,uy+2,r,r*0.5,0,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.fill();
    // Circle body
    ctx.beginPath(); ctx.arc(ux,uy,r,0,Math.PI*2);
    ctx.fillStyle=isPlayer?'#4a7a4a':'#7a2a2a';
    ctx.fill();
    // Selection ring
    if(g.selected.includes(u.id)){
      ctx.beginPath(); ctx.arc(ux,uy,r+3/cam.zoom,0,Math.PI*2);
      ctx.strokeStyle='#80ff80'; ctx.lineWidth=2/cam.zoom; ctx.stroke();
    } else {
      ctx.strokeStyle=isPlayer?'#8ab88a':'#b85050'; ctx.lineWidth=1.5/cam.zoom; ctx.stroke();
    }
    // Emoji
    ctx.fillText(u.getEmoji(),ux,uy+1);
    // HP bar
    drawHPBar(ctx,ux-r,uy-r-7/cam.zoom,r*2,5/cam.zoom,u.hp/u.maxHp,isPlayer?'#4aff4a':'#ff4a4a');
  }

  // Build mode ghost
  if(g.buildMode&&g._ghostTile){
    const {tx,ty}=g._ghostTile;
    const s=BDEF[g.buildMode.type].size*ts;
    const valid=canPlaceBuilding(g,tx,ty,BDEF[g.buildMode.type].size);
    ctx.fillStyle=valid?'rgba(0,255,0,0.25)':'rgba(255,0,0,0.25)';
    ctx.fillRect(tx*ts,ty*ts,s,s);
    ctx.strokeStyle=valid?'#00ff00':'#ff0000';
    ctx.lineWidth=2/cam.zoom;
    ctx.strokeRect(tx*ts,ty*ts,s,s);
    ctx.font=`${Math.floor(s*0.55)}px serif`;
    ctx.globalAlpha=0.7;
    ctx.fillText(BDEF[g.buildMode.type].emoji,tx*ts+s/2,ty*ts+s/2);
    ctx.globalAlpha=1;
  }

  ctx.restore();

  // Selection box
  if(g.selBox){
    const sb=g.selBox;
    ctx.strokeStyle='rgba(128,255,128,0.8)';
    ctx.lineWidth=1;
    ctx.strokeRect(sb.x0,sb.y0,sb.x1-sb.x0,sb.y1-sb.y0);
    ctx.fillStyle='rgba(128,255,128,0.06)';
    ctx.fillRect(sb.x0,sb.y0,sb.x1-sb.x0,sb.y1-sb.y0);
  }

  renderMinimap(g);
}

function drawHPBar(ctx,x,y,w,h,pct,color){
  ctx.fillStyle='rgba(0,0,0,0.6)';
  ctx.fillRect(x,y,w,h);
  ctx.fillStyle=color;
  ctx.fillRect(x,y,w*Math.max(0,pct),h);
}

function renderMinimap(g){
  const mc=g.minimap, mctx=g.mctx;
  if(!mc||!mctx) return;
  const mw=mc.width, mh=mc.height;
  const tw=mw/MAP_W, th=mh/MAP_H;
  mctx.clearRect(0,0,mw,mh);
  // Tiles
  for(let ty=0;ty<MAP_H;ty++) for(let tx=0;tx<MAP_W;tx++){
    const t=g.map[ty][tx];
    mctx.fillStyle=t.type===T.WATER?'#1e4fa8':t.type===T.TREE?'#2d5a1c':t.type===T.GOLD?'#d4af37':t.type===T.STONE?'#888':t.type===T.BERRY?'#7a3a8a':'#5a8a3c';
    mctx.fillRect(tx*tw,ty*th,tw+0.5,th+0.5);
  }
  // Buildings
  for(const b of g.buildings){
    if(b.dead) continue;
    mctx.fillStyle=b.owner===0?'#4a8aff':'#ff4a4a';
    mctx.fillRect(b.tx*tw,b.ty*th,b.getSize()*tw+1,b.getSize()*th+1);
  }
  // Units
  for(const u of g.units){
    if(u.dead) continue;
    const [ux,uy]=worldToTile(u.x,u.y);
    mctx.fillStyle=u.owner===0?'#80d0ff':'#ff8080';
    mctx.fillRect(ux*tw,uy*th,tw+1,th+1);
  }
  // Viewport rect
  const cam=g.camera;
  const canvas=g.canvas;
  const vx=cam.x/TILE_SIZE*tw, vy=cam.y/TILE_SIZE*th;
  const vw=canvas.width/cam.zoom/TILE_SIZE*tw, vh=canvas.height/cam.zoom/TILE_SIZE*th;
  mctx.strokeStyle='rgba(255,255,255,0.7)';
  mctx.lineWidth=1;
  mctx.strokeRect(vx,vy,vw,vh);
}


// ===== HUD =====
function updateHUD(g){
  const r=g.resources;
  document.getElementById('food-count').textContent=Math.floor(r.food||0);
  document.getElementById('wood-count').textContent=Math.floor(r.wood||0);
  document.getElementById('gold-count').textContent=Math.floor(r.gold||0);
  document.getElementById('stone-count').textContent=Math.floor(r.stone||0);
  document.getElementById('pop-count').textContent=g.pop||0;
  document.getElementById('pop-cap').textContent=g.popCap||10;
  document.getElementById('age-name').textContent=AGES[g.age];

  // Advance age button
  const ageBtn=document.getElementById('btn-advance-age');
  if(g.age>=3){ ageBtn.disabled=true; ageBtn.textContent='Max Age'; }
  else {
    const nextCost=AGE_COST[g.age+1];
    const affordable=canAfford(r,nextCost);
    ageBtn.disabled=!affordable;
    const costStr=Object.entries(nextCost).map(([k,v])=>v+' '+k).join(', ');
    ageBtn.title='Advance to '+AGES[g.age+1]+' ('+costStr+')';
  }

  updateSelectionPanel(g);
  updateNotifications(g);
}

function updateSelectionPanel(g){
  const ids=new Set(g.selected);
  const selEnt=[...g.units,...g.buildings].filter(e=>ids.has(e.id)&&!e.dead);
  const iconEl=document.getElementById('sel-icon');
  const nameEl=document.getElementById('sel-name');
  const statsEl=document.getElementById('sel-stats');
  const actEl=document.getElementById('action-buttons');
  const queueEl=document.getElementById('build-queue');
  const qLabelEl=document.getElementById('build-queue-label');

  actEl.innerHTML=''; queueEl.innerHTML='';

  if(selEnt.length===0){
    iconEl.textContent='⚔️'; nameEl.textContent='Nothing selected'; statsEl.textContent=''; qLabelEl.classList.add('hidden'); return;
  }

  if(selEnt.length>1){
    iconEl.textContent='👥'; nameEl.textContent=selEnt.length+' units selected'; statsEl.textContent=''; qLabelEl.classList.add('hidden');
    return;
  }

  const e=selEnt[0];
  const isUnit=e instanceof Unit;
  iconEl.textContent=e.getEmoji();

  if(isUnit){
    const def=UNIT_DEF[e.type];
    nameEl.textContent=e.type.charAt(0)+e.type.slice(1).toLowerCase();
    statsEl.innerHTML=`❤️ ${Math.ceil(e.hp)}/${e.maxHp} &nbsp; ⚔️ ${def.attack} &nbsp; ${e.state}`;
    qLabelEl.classList.add('hidden');
    // Actions
    if(e.type===UT.VILLAGER&&e.owner===0){
      [BT.HOUSE,BT.BARRACKS,BT.LUMBER_CAMP,BT.MINING_CAMP,BT.FARM].forEach(btype=>{
        if(btype===BT.BARRACKS&&g.age<1) return;
        const def2=BDEF[btype];
        const costStr=Object.entries(def2.cost).map(([k,v])=>v+' '+k).join(', ');
        const btn=document.createElement('button');
        btn.className='action-btn'+(g.buildMode&&g.buildMode.type===btype?' active':'');
        btn.textContent=def2.emoji+' '+btype.replace('_',' ').toLowerCase();
        btn.title='Build '+btype.replace('_',' ')+(costStr?' ('+costStr+')':'');
        btn.disabled=!canAfford(g.resources,def2.cost);
        btn.onclick=()=>{ g.buildMode=g.buildMode&&g.buildMode.type===btype?null:{type:btype}; updateSelectionPanel(g); };
        actEl.appendChild(btn);
      });
    }
  } else {
    // Building
    const def=BDEF[e.type];
    nameEl.textContent=e.type.replace('_',' ').charAt(0).toUpperCase()+e.type.replace('_',' ').slice(1).toLowerCase();
    const prog=e.isComplete()?'':` (${Math.floor(e.constructProgress*100)}%)`;
    statsEl.innerHTML=`❤️ ${Math.ceil(e.hp)}/${e.maxHp}${prog}`;
    if(e.owner===0){
      if(e.type===BT.TOWN_CENTER){
        addTrainBtn(actEl,g,e,UT.VILLAGER,'🧑 Villager');
      }
      if(e.type===BT.BARRACKS&&g.age>=1){
        addTrainBtn(actEl,g,e,UT.MILITIA,'⚔️ Militia');
        addTrainBtn(actEl,g,e,UT.ARCHER,'🏹 Archer');
        if(g.age>=2) addTrainBtn(actEl,g,e,UT.KNIGHT,'🐴 Knight');
      }
      // Rally point btn
      if([BT.TOWN_CENTER,BT.BARRACKS].includes(e.type)){
        const btn=document.createElement('button');
        btn.className='action-btn'; btn.textContent='📍 Set Rally';
        btn.title='Right-click map to set rally point';
        btn.onclick=()=>{ g._settingRally=e.id; g.notify('Right-click to set rally point'); };
        actEl.appendChild(btn);
      }
      // Queue display
      if(e.trainQueue.length>0){
        qLabelEl.classList.remove('hidden');
        e.trainQueue.forEach((ut,i)=>{
          const qi=document.createElement('div');
          qi.className='queue-item';
          qi.textContent=UNIT_DEF[ut].emoji;
          if(i===0){
            const bar=document.createElement('div');
            bar.className='queue-bar';
            bar.style.width=(e.trainTimer/UNIT_DEF[ut].trainTime*100)+'%';
            qi.appendChild(bar);
          }
          queueEl.appendChild(qi);
        });
      } else { qLabelEl.classList.add('hidden'); }
    }
  }
}

function addTrainBtn(container, g, building, unitType, label){
  const cost=UNIT_DEF[unitType].cost;
  const costStr=Object.entries(cost).map(([k,v])=>v+' '+k).join(', ');
  const btn=document.createElement('button');
  btn.className='action-btn';
  btn.textContent='Train '+label;
  btn.title=costStr;
  btn.disabled=!canAfford(g.resources,cost)||g.pop>=g.popCap||building.trainQueue.length>=5||!building.isComplete();
  btn.onclick=()=>{
    if(!canAfford(g.resources,cost)||g.pop>=g.popCap||building.trainQueue.length>=5) return;
    deductCost(g.resources,cost);
    building.trainQueue.push(unitType);
    updateSelectionPanel(g);
  };
  container.appendChild(btn);
}

function updateNotifications(g){
  const el=document.getElementById('notification');
  if(g.notifications.length===0){ el.classList.add('hidden'); return; }
  const latest=g.notifications[g.notifications.length-1];
  el.textContent=latest.msg;
  el.style.color=latest.color||'#f0c040';
  el.classList.remove('hidden');
  // Re-trigger animation
  el.style.animation='none';
  void el.offsetHeight;
  el.style.animation='fadeNotif 3s forwards';
}


// ===== INPUT =====
function setupInput(g){
  const canvas=g.canvas;

  // Keyboard
  document.addEventListener('keydown',e=>{
    g.keys[e.key]=true;
    if(e.key==='Escape'){ g.buildMode=null; g.selected=[]; updateSelectionPanel(g); }
    if(e.key==='p'||e.key==='P') togglePause(g);
  });
  document.addEventListener('keyup',e=>{ g.keys[e.key]=false; });

  // Mouse
  let mouseDown=false, mouseBtn=0;
  canvas.addEventListener('mousedown',e=>{
    e.preventDefault();
    mouseDown=true; mouseBtn=e.button;
    const {wx,wy}=screenToWorld(g,e.clientX,e.clientY);
    if(e.button===0){
      if(g.buildMode){
        const [tx,ty]=worldToTile(wx,wy);
        const size=BDEF[g.buildMode.type].size;
        if(canPlaceBuilding(g,tx,ty,size)&&canAfford(g.resources,BDEF[g.buildMode.type].cost)){
          deductCost(g.resources,BDEF[g.buildMode.type].cost);
          const b=g.placeBuilding(0,g.buildMode.type,tx,ty);
          // Send selected villager to build
          const selVills=g.getSelectedUnits().filter(u=>u.type===UT.VILLAGER);
          if(selVills.length>0){
            selVills[0].state='BUILD'; selVills[0].constructTarget=b.id;
            selVills[0].path=findPath(g,selVills[0].x,selVills[0].y,b.x,b.y);
          } else { sendVillagerToBuild(g,0,b); }
          const builtType=g.buildMode.type;
          g.buildMode=null;
          g.notify('Building '+builtType.replace('_',' ').toLowerCase()+' placed!');
          updateSelectionPanel(g);
        } else {
          g.notify('Cannot place here!','#ff6060');
        }
        return;
      }
      // Start selection box
      g.selBoxStart={x:e.clientX,y:e.clientY};
      g.selBox=null;
    } else if(e.button===2){
      handleRightClick(g,wx,wy);
    }
  });

  canvas.addEventListener('mousemove',e=>{
    const {wx,wy}=screenToWorld(g,e.clientX,e.clientY);
    // Update ghost tile for build mode
    if(g.buildMode){ const [tx,ty]=worldToTile(wx,wy); g._ghostTile={tx,ty}; }
    // Selection box
    if(mouseDown&&mouseBtn===0&&!g.buildMode&&g.selBoxStart){
      const dx=e.clientX-g.selBoxStart.x, dy=e.clientY-g.selBoxStart.y;
      if(Math.abs(dx)>4||Math.abs(dy)>4){
        g.selBox={
          x0:Math.min(e.clientX,g.selBoxStart.x), y0:Math.min(e.clientY,g.selBoxStart.y),
          x1:Math.max(e.clientX,g.selBoxStart.x), y1:Math.max(e.clientY,g.selBoxStart.y)
        };
      }
    }
    // Cursor style
    if(g.buildMode) canvas.style.cursor='crosshair';
    else canvas.style.cursor='default';
  });

  canvas.addEventListener('mouseup',e=>{
    const {wx,wy}=screenToWorld(g,e.clientX,e.clientY);
    if(e.button===0){
      if(g.selBox){
        // Box select
        const sb=g.selBox;
        g.selected=[];
        for(const u of g.units){
          if(u.owner!==0) continue;
          const {sx,sy}=worldToScreen(g,u.x,u.y);
          if(sx>=sb.x0&&sx<=sb.x1&&sy>=sb.y0&&sy<=sb.y1) g.selected.push(u.id);
        }
        g.selBox=null; g.selBoxStart=null;
      } else if(g.selBoxStart&&!g.buildMode){
        // Single click select
        const dx=e.clientX-g.selBoxStart.x, dy=e.clientY-g.selBoxStart.y;
        if(Math.abs(dx)<5&&Math.abs(dy)<5) singleSelect(g,wx,wy);
        g.selBoxStart=null;
      }
      updateSelectionPanel(g);
    }
    mouseDown=false;
  });

  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  // Scroll to zoom
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    const {wx,wy}=screenToWorld(g,e.clientX,e.clientY);
    const factor=e.deltaY>0?0.9:1.1;
    const newZoom=clamp(g.camera.zoom*factor,0.35,2.5);
    // Zoom toward mouse position
    g.camera.x=wx-(wx-g.camera.x)*(newZoom/g.camera.zoom);
    g.camera.y=wy-(wy-g.camera.y)*(newZoom/g.camera.zoom);
    g.camera.zoom=newZoom;
  },{passive:false});

  // Minimap click
  const mm=document.getElementById('minimap');
  mm.addEventListener('mousedown',e=>{
    g.minimapDragging=true;
    minimapClick(g,e);
  });
  document.addEventListener('mousemove',e=>{ if(g.minimapDragging) minimapClick(g,e); });
  document.addEventListener('mouseup',()=>{ g.minimapDragging=false; });
}

function minimapClick(g,e){
  const mm=document.getElementById('minimap');
  const rect=mm.getBoundingClientRect();
  const mx=(e.clientX-rect.left)/rect.width;
  const my=(e.clientY-rect.top)/rect.height;
  const wx=mx*MAP_W*TILE_SIZE - g.canvas.width/(2*g.camera.zoom);
  const wy=my*MAP_H*TILE_SIZE - g.canvas.height/(2*g.camera.zoom);
  g.camera.x=clamp(wx,0,MAP_W*TILE_SIZE-g.canvas.width/g.camera.zoom);
  g.camera.y=clamp(wy,0,MAP_H*TILE_SIZE-g.canvas.height/g.camera.zoom);
}

function screenToWorld(g,sx,sy){
  const rect=g.canvas.getBoundingClientRect();
  return { wx:(sx-rect.left)/g.camera.zoom+g.camera.x, wy:(sy-rect.top)/g.camera.zoom+g.camera.y };
}

function worldToScreen(g,wx,wy){
  const rect=g.canvas.getBoundingClientRect();
  return { sx:(wx-g.camera.x)*g.camera.zoom+rect.left, sy:(wy-g.camera.y)*g.camera.zoom+rect.top };
}

function singleSelect(g,wx,wy){
  if(g._settingRally){
    const b=g.buildings.find(b=>b.id===g._settingRally);
    if(b){ b.rallyX=wx; b.rallyY=wy; }
    g._settingRally=null; return;
  }
  // Try to select unit first
  const ts=TILE_SIZE;
  for(const u of g.units){
    if(u.dead) continue;
    if(dist(wx,wy,u.x,u.y)<ts*0.45){ g.selected=[u.id]; return; }
  }
  // Try building
  for(const b of g.buildings){
    if(b.dead) continue;
    const s=b.getSize()*ts;
    if(wx>=b.tx*ts&&wx<(b.tx+b.getSize())*ts&&wy>=b.ty*ts&&wy<(b.ty+b.getSize())*ts){
      g.selected=[b.id]; return;
    }
  }
  g.selected=[];
}

function handleRightClick(g,wx,wy){
  if(g.buildMode){ g.buildMode=null; return; }
  if(g._settingRally){ g._settingRally=null; return; }
  const selUnits=g.getSelectedUnits().filter(u=>u.owner===0);
  if(selUnits.length===0){
    // Check selected building for rally
    const selBuildings=g.getSelectedEntities().filter(e=>e instanceof Building&&e.owner===0);
    if(selBuildings.length>0){ selBuildings[0].rallyX=wx; selBuildings[0].rallyY=wy; g.notify('Rally point set'); }
    return;
  }
  // Check if clicking on enemy
  const ts=TILE_SIZE;
  for(const e of [...g.units,...g.buildings]){
    if(e.dead||e.owner===0) continue;
    let hit=false;
    if(e instanceof Unit) hit=dist(wx,wy,e.x,e.y)<ts*0.45;
    else { const s=e.getSize()*ts; hit=(wx>=e.tx*ts&&wx<(e.tx+e.getSize())*ts&&wy>=e.ty*ts&&wy<(e.ty+e.getSize())*ts); }
    if(hit){
      for(const u of selUnits){ u.state='ATTACK'; u.targetEntity=e.id; u.path=findPath(g,u.x,u.y,e.x,e.y); }
      return;
    }
  }
  // Check resource tiles (for villagers)
  const [tx,ty]=worldToTile(wx,wy);
  if(tx>=0&&ty>=0&&tx<MAP_W&&ty<MAP_H){
    const tile=g.map[ty][tx];
    const gatherTypes=[T.TREE,T.GOLD,T.STONE,T.BERRY];
    if(gatherTypes.includes(tile.type)&&tile.amount>0){
      const typeMap={[T.TREE]:'wood',[T.GOLD]:'gold',[T.STONE]:'stone',[T.BERRY]:'food'};
      const vills=selUnits.filter(u=>u.type===UT.VILLAGER);
      for(const v of vills){
        v.carryType=typeMap[tile.type];
        v.targetTile={tx,ty}; v.state='GATHER'; v.carrying=0;
        const [twx,twy]=tileToWorld(tx,ty);
        v.path=findPath(g,v.x,v.y,twx,twy);
      }
      if(vills.length>0) return;
    }
  }
  // Move units in formation
  const spread=Math.ceil(Math.sqrt(selUnits.length));
  selUnits.forEach((u,i)=>{
    const row=Math.floor(i/spread), col=i%spread;
    const mx=wx+(col-spread/2)*TILE_SIZE*0.9, my=wy+(row-spread/2)*TILE_SIZE*0.9;
    u.state='MOVE'; u.targetEntity=null;
    u.path=findPath(g,u.x,u.y,mx,my);
  });
}

function canPlaceBuilding(g,tx,ty,size){
  if(tx<0||ty<0||tx+size>MAP_W||ty+size>MAP_H) return false;
  for(let sx=0;sx<size;sx++) for(let sy=0;sy<size;sy++){
    const t=g.map[ty+sy][tx+sx];
    if(t.type===T.WATER||g.getBuildingAt(tx+sx,ty+sy)) return false;
  }
  return true;
}

// Camera panning
function updateCamera(g,dt){
  const spd=350/g.camera.zoom;
  const k=g.keys;
  if(k['w']||k['W']||k['ArrowUp'])    g.camera.y-=spd*dt;
  if(k['s']||k['S']||k['ArrowDown'])  g.camera.y+=spd*dt;
  if(k['a']||k['A']||k['ArrowLeft'])  g.camera.x-=spd*dt;
  if(k['d']||k['D']||k['ArrowRight']) g.camera.x+=spd*dt;
  const maxX=MAP_W*TILE_SIZE-g.canvas.width/g.camera.zoom;
  const maxY=MAP_H*TILE_SIZE-g.canvas.height/g.camera.zoom;
  g.camera.x=clamp(g.camera.x,0,Math.max(0,maxX));
  g.camera.y=clamp(g.camera.y,0,Math.max(0,maxY));
}


// ===== GAME LOOP =====
function gameLoop(timestamp){
  if(!game) return;
  const dt=Math.min((timestamp-game.lastTime)/1000, 0.1);
  game.lastTime=timestamp;
  updateCamera(game,dt);
  updateGame(game,dt);
  renderGame(game);
  game.frameId=requestAnimationFrame(gameLoop);
}

// ===== INIT =====
function initGame(){
  game=new GameState();
  const canvas=document.getElementById('game-canvas');
  const minimap=document.getElementById('minimap');
  game.canvas=canvas;
  game.ctx=canvas.getContext('2d');
  game.minimap=minimap;
  game.mctx=minimap.getContext('2d');

  function resize(){
    canvas.width=canvas.clientWidth;
    canvas.height=canvas.clientHeight;
  }
  resize();
  window.addEventListener('resize',resize);

  // Player start: top-left area
  const playerTCx=3, playerTCy=3;
  game.placeBuilding(0,BT.TOWN_CENTER,playerTCx,playerTCy,true);
  // Spawn starting villagers
  const [ptcwx,ptcwy]=tileToWorld(playerTCx+2,playerTCy+2);
  for(let i=0;i<3;i++) game.spawnUnit(0,UT.VILLAGER,ptcwx+i*TILE_SIZE,ptcwy+TILE_SIZE*1.5);
  // Camera start
  game.camera.x=ptcwx-canvas.width/2;
  game.camera.y=ptcwy-canvas.height/2;

  // AI start: bottom-right area
  const aiTCx=MAP_W-8, aiTCy=MAP_H-8;
  game.placeBuilding(1,BT.TOWN_CENTER,aiTCx,aiTCy,true);
  const [aitcwx,aitcwy]=tileToWorld(aiTCx+2,aiTCy+2);
  for(let i=0;i<4;i++) game.spawnUnit(1,UT.VILLAGER,aitcwx+i*TILE_SIZE,aitcwy+TILE_SIZE*1.5);

  // Clear trees near starts
  clearStartArea(game.map,playerTCx,playerTCy,6);
  clearStartArea(game.map,aiTCx,aiTCy,6);

  setupInput(game);
  document.getElementById('game-container').classList.remove('hidden');

  // Setup menu buttons
  document.getElementById('btn-advance-age').onclick=()=>{ advanceAge(game); };
  document.getElementById('btn-pause').onclick=()=>{ togglePause(game); };
  document.getElementById('btn-resume').onclick=()=>{ togglePause(game); document.getElementById('pause-menu').classList.add('hidden'); };
  document.getElementById('btn-restart').onclick=()=>{ restartGame(); };
  document.getElementById('btn-main-menu').onclick=()=>{ goMainMenu(); };
  document.getElementById('btn-play-again').onclick=()=>{ restartGame(); };
  document.getElementById('btn-end-main-menu').onclick=()=>{ goMainMenu(); };

  game.frameId=requestAnimationFrame(t=>{ game.lastTime=t; gameLoop(t); });
  game.notify('Welcome! Build and conquer. Destroy all enemy buildings to win!');
}

function clearStartArea(map,tx,ty,r){
  for(let y=ty-r;y<=ty+r+4;y++) for(let x=tx-r;x<=tx+r+4;x++){
    if(x>=0&&y>=0&&x<MAP_W&&y<MAP_H&&(map[y][x].type===T.TREE||map[y][x].type===T.STONE||map[y][x].type===T.GOLD))
      map[y][x].type=T.GRASS;
  }
}

function advanceAge(g){
  if(g.age>=3) return;
  const cost=AGE_COST[g.age+1];
  if(!canAfford(g.resources,cost)){ g.notify('Not enough resources!','#ff6060'); return; }
  deductCost(g.resources,cost);
  g.age++;
  g.notify('Advanced to '+AGES[g.age]+'!','#f0c040');
}

function togglePause(g){
  g.paused=!g.paused;
  document.getElementById('pause-menu').classList.toggle('hidden',!g.paused);
  document.getElementById('btn-pause').textContent=g.paused?'▶ Resume':'⏸ Pause';
}

function restartGame(){
  if(game&&game.frameId) cancelAnimationFrame(game.frameId);
  document.getElementById('pause-menu').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('game-container').classList.add('hidden');
  initGame();
}

function goMainMenu(){
  if(game&&game.frameId) cancelAnimationFrame(game.frameId);
  game=null;
  document.getElementById('pause-menu').classList.add('hidden');
  document.getElementById('end-screen').classList.add('hidden');
  document.getElementById('game-container').classList.add('hidden');
  document.getElementById('main-menu').classList.remove('hidden');
}

// ===== MENU SETUP =====
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('btn-single-player').onclick=()=>{
    document.getElementById('main-menu').classList.add('hidden');
    initGame();
  };
  document.getElementById('btn-how-to-play').onclick=()=>{
    document.getElementById('how-to-play-modal').classList.remove('hidden');
  };
  document.getElementById('btn-close-help').onclick=()=>{
    document.getElementById('how-to-play-modal').classList.add('hidden');
  };
});

