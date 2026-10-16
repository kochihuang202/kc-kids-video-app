import {storage,preview,draftURL} from './storage.js?v=d57971c562d6';
import {openProgress} from './cloud.js?v=d57971c562d6';
const key='shimajiro-reading-preferences:v1';
export function preferenceValues(v={}){
 return {bopo:v.bopo!==false,size:[0,1,2].includes(v.size)?v.size:0,words:v.words!==false,rate:[0.6,0.85,1].includes(v.rate)?v.rate:0.85};
}
export async function openPreferences(fallback={}){
 let local;try{local=JSON.parse(storage.getItem(key)||'null');}catch{}
 const cloud=await openProgress('reading','settings',preferenceValues(local||fallback));let value=preferenceValues(cloud.value);if(local||cloud.hasDocument||Object.keys(fallback).length)try{storage.setItem(key,JSON.stringify(value));}catch{}
 return {get value(){return {...value};},update(v){const next=preferenceValues(v);if(JSON.stringify(next)===JSON.stringify(value))return;value=next;try{storage.setItem(key,JSON.stringify(value));}catch{}cloud.update(value);},get status(){return cloud.status;},flush:cloud.flush};
}
