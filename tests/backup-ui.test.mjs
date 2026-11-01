import test from 'node:test';
import assert from 'node:assert/strict';
import {readBackupPreferences,applyBackupPreferences,backupSummaryHTML} from '../web/backup-ui.js';

const defaults={theme:'light',textSize:100,proofLanguage:'pt-BR',liveWriting:true,vocabularyHints:false,acceptedWords:{},favorites:[],recent:[]};
function fixture(){
  const values=new Map([['trama-theme','dark'],['trama-text-size','125'],['trama-proof-language','en-US'],['trama-live-writing','on'],['trama-vocabulary-hints','off'],['trama-favorites','["good-id","../bad"]'],['trama-recent','["good-id"]'],['trama-spell-ignored','{"en-US":["Trama","bad\\nword"],"unknown":["secret"]}'],['token','secret'],['trama-session','private']]);
  return {values,storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}};
}

test('backup exports only valid named browser preferences, never arbitrary storage',()=>{
  const {storage}=fixture();
  assert.deepEqual(readBackupPreferences(storage),{theme:'dark',textSize:125,proofLanguage:'en-US',liveWriting:true,vocabularyHints:false,favorites:['good-id'],recent:['good-id'],acceptedWords:{'en-US':['Trama']}});
});

test('effective defaults survive backup and replace different preferences at destination',()=>{
  const empty=readBackupPreferences({getItem(){return null;}}),{values,storage}=fixture();
  assert.deepEqual(empty,defaults);assert.equal(applyBackupPreferences(storage,empty),true);
  assert.deepEqual(readBackupPreferences(storage),defaults);assert.equal(values.get('trama-theme'),'light');
});

test('applying preferences leaves credential and unrelated storage keys untouched',()=>{
  const {values,storage}=fixture();
  assert.equal(applyBackupPreferences(storage,{theme:'light',token:'unexpected','trama-session':'another'}),true);
  assert.equal(values.get('trama-theme'),'light');assert.equal(values.get('token'),'secret');assert.equal(values.get('trama-session'),'private');
  assert.equal(values.get('trama-text-size'),'125');
});

test('blocked storage is reported without falsely asserting preference persistence',()=>{
  assert.deepEqual(readBackupPreferences({getItem(){throw Error('blocked');}}),defaults);
  assert.equal(applyBackupPreferences({setItem(){throw Error('quota');}},{theme:'dark'}),false);
});

test('invalid browser settings fall back safely and list limits are enforced',()=>{
  const {storage,values}=fixture();values.set('trama-theme','<script>');values.set('trama-text-size','999');values.set('trama-live-writing','false');values.set('trama-recent',JSON.stringify(Array.from({length:30},(_,i)=>`id-${i}`)));
  const result=readBackupPreferences(storage);assert.equal(result.theme,'light');assert.equal(result.textSize,100);assert.equal(result.liveWriting,true);assert.equal(result.recent.length,20);
});

test('backup summary escapes untrusted values and never renders malicious counts',()=>{
  const html=backupSummaryHTML({created:'<script>x</script>',pages:'<script>x</script>',blocks:3,attachments:0,history:2,drafts:1,attachmentBytes:0});
  assert.equal(html.includes('<script>'),false);assert.equal(html.includes('—'),true);assert.equal(html.includes('data indisponível'),true);
});
