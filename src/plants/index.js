import cartpole from './cartpole.js';
import quadrotor from './quadrotor.js';
import furuta from './furuta.js';
import ballplate from './ballplate.js';
import segway from './segway.js';
import arm from './arm.js';
import maglev from './maglev.js';
import doublependulum from './doublependulum.js';
import crane from './crane.js';
import spacecraft from './spacecraft.js';
import ballbeam from './ballbeam.js';
import rocket from './rocket.js';

export const plants = [cartpole, ballbeam, ballplate, maglev, furuta, segway, arm, crane, quadrotor, doublependulum, rocket, spacecraft];
export const plantById = Object.fromEntries(plants.map((p) => [p.id, p]));
