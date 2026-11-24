import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {getEarthquakeHistoryPresetRange,getJmaLatestAvailableDate} from '../src/jma/earthquakeHistory.js';
for(const [preset,endDate,startDate] of [
 ['month','2025-11-22','2025-10-23'],['year','2025-11-22','2024-11-23'],['decade','2025-11-22','2015-11-23'],
 ['month','2024-03-31','2024-03-01'],['month','2025-03-31','2025-03-01'],['year','2024-02-29','2023-03-01'],
 ['all','2020-06-15','1919-01-01'],['decade','1920-02-29','1919-01-01']]){
 assert.deepEqual(getEarthquakeHistoryPresetRange(preset,endDate),{startDate,endDate});
}
assert.equal(getEarthquakeHistoryPresetRange('month','2099-01-01').endDate,getJmaLatestAvailableDate());
assert.equal(getEarthquakeHistoryPresetRange('month','invalid').endDate,getJmaLatestAvailableDate());
assert.throws(()=>getEarthquakeHistoryPresetRange('weekly','2025-11-22'),/検索期間/);
const source=fs.readFileSync(new URL('../src/ui/leftPanel.js',import.meta.url),'utf8');
class Form{
 constructor(){this.values=Object.fromEntries(Object.entries({startDate:'2025-11-16',endDate:'2025-11-22',minIntensity:'3',minMagnitude:'6',maxDepth:'12',sort:'magnitude',keyword:'佐渡'}).map(([name,value])=>[name,{value}]));this.elements={namedItem:name=>this.values[name]};this.valid=true;}
 reportValidity(){return this.valid;}
 querySelectorAll(){return buttons;}
}
const buttons=['month','year','decade','all'].map(period=>({dataset:{earthquakeArchivePeriod:period},classList:{toggle(){}},setAttribute(name,value){this[name]=value;},closest:()=>form}));
const form=new Form(),changes=[],searches=[];
const context=vm.createContext({HTMLFormElement:Form,form,getEarthquakeHistoryPresetRange,
 onArchiveFilterChange:filters=>changes.push(filters),onArchiveSearch:filters=>searches.push(filters)});
vm.runInContext(source.slice(source.indexOf('  const readArchiveSearchFilters ='),source.indexOf('  const handleClick =',source.indexOf('  const readArchiveSearchFilters ='))),context);
vm.runInContext('function presetClick(event) {'+source.slice(source.indexOf('    const archivePeriodButton ='),source.indexOf('    const archiveSearchButton ='))+'}',context);
context.presetClick({target:{closest:()=>buttons[0]},preventDefault(){},stopPropagation(){}});
assert.equal(form.values.startDate.value,'2025-10-23');
assert.equal(form.values.endDate.value,'2025-11-22');
assert.equal(changes[0].minMagnitude,'6');assert.equal(changes[0].maxDepth,'12');assert.equal(changes[0].keyword,'佐渡');
assert.equal(searches.length,0,'preset selection must not run a search');
assert.equal(buttons[0]['aria-pressed'],'true');assert.equal(buttons[1]['aria-pressed'],'false');
form.valid=false;vm.runInContext('submitArchiveSearch(form)',context);assert.equal(searches.length,0,'invalid numeric input must not reach the search');
form.valid=true;form.values.minMagnitude.value='1';form.values.maxDepth.value='1';vm.runInContext('submitArchiveSearch(form)',context);
assert.equal(searches[0].minMagnitude,'1');assert.equal(searches[0].maxDepth,'1');
form.values.minMagnitude.value='';form.values.maxDepth.value='';vm.runInContext('submitArchiveSearch(form)',context);
assert.equal(searches[1].minMagnitude,'0');assert.equal(searches[1].maxDepth,'all');
console.log('Earthquake history presets: calendar month/year/leap cases, selected end date, draft updates, unit inputs, validation and unspecified values passed');
