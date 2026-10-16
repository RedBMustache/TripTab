// TripTab v0.4.0 — beginner-friendly JavaScript with automatic saving.
// This is still a prototype: exchange rates are shared, and split rounding is
// simplified. The new feature is persistence in this browser, not cloud sync.
//
// Learning tip: "const" prevents reassignment of a variable; "let" allows it.
// Arrays and objects declared with const can still have their contents changed.
const PEOPLE = ["Alice", "Bob", "Charlie", "David"];
const COLORS = ["#3478db", "#17a67a", "#df9a35", "#9666d5"];
// Fixed palette: exactly 24 available colors.
const PALETTE = [
  "#3478db", "#17a67a", "#df9a35", "#9666d5", "#e45c5c", "#20a4b5",
  "#ef7c40", "#ca64a3", "#6379bb", "#7b9e35", "#bd704f", "#66778c",
  "#194f90", "#0c755b", "#a96813", "#6b42a0", "#b63452", "#007b8a",
  "#c64d17", "#8c447f", "#43539c", "#58701c", "#8a4e31", "#39475c"
];
// Local date, not UTC: yy/mm/dd.
function todayDate(){
  const d=new Date();
  return `${String(d.getFullYear()).slice(-2)}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}
function validBillDate(value){
  if(!/^\d{2}\/\d{2}\/\d{2}$/.test(value))return false;
  const [yy,mm,dd]=value.split('/').map(Number);
  const d=new Date(2000+yy,mm-1,dd);
  return d.getFullYear()===2000+yy && d.getMonth()===mm-1 && d.getDate()===dd;
}

// Each group is a reusable combination of members. Activities retain their own
// participant snapshots; editing a group never changes historical bills.
let GROUPS = [
  {id:'g1',name:'All Travelers',memberIds:[0,1,2,3]},
  {id:'g2',name:'Dinner Group',memberIds:[0,1,2]},
  {id:'g3',name:'Taxi Group',memberIds:[1,2]}
];
let nextGroupId=4;
let editingGroupId=null;
const sameMembers=(a,b)=>a.length===b.length&&a.every(x=>b.includes(x));
const groupById=id=>GROUPS.find(g=>g.id===id);
const groupForBill=b=>GROUPS.find(g=>sameMembers(g.memberIds,b.participants));
let bills = [
  {id:1,name:"Hotel",amount:30000,currency:"JPY",payer:"Alice",group:"All Travelers",participants:[0,1,2,3]},
  {id:2,name:"Dinner",amount:12000,currency:"JPY",payer:"Bob",group:"Dinner Group",participants:[0,1,2]},
  {id:3,name:"Taxi",amount:4000,currency:"JPY",payer:"Charlie",group:"Taxi Group",participants:[1,2]},
  {id:4,name:"Museum",amount:6500,currency:"JPY",payer:"Alice",group:"All Travelers",participants:[0,1,2,3]},
  {id:5,name:"Breakfast",amount:3200,currency:"JPY",payer:"David",group:"All Travelers",participants:[0,3]},
  {id:6,name:"Train",amount:8600,currency:"JPY",payer:"Bob",group:"All Travelers",participants:[0,1,2]},
  {id:7,name:"Coffee",amount:1800,currency:"JPY",payer:"Charlie",group:"Taxi Group",participants:[1,2]}
];
// Seed demo bills with today's date. New bills and duplicates receive their own issue date.
bills.forEach(b => { b.date=todayDate(); });
let selectedId = 1;
let editingMemberIndex = null;
let groupFilter = "All"; // group ID, or All
const CURRENCIES = ['JPY','CNY','USD','EUR','GBP','KRW','HKD','TWD'];
// Demo manual reference rates: units of CNY for one unit of each currency.
const ratesToCNY = {JPY:0.045,CNY:1,USD:7.1,EUR:7.8,GBP:9.2,KRW:0.0052,HKD:0.91,TWD:0.22};
let sourceCurrency = 'JPY';
let settlementCurrency = 'CNY';
// ============================================================================
// 01. AUTOSAVE: browser localStorage
// ============================================================================
// localStorage is a small key/value database built into the browser.
// It stores STRINGS, so JSON.stringify converts our JavaScript objects into
// a string; JSON.parse converts the saved string back into objects.
//
// Each browser/profile/device has its OWN storage. Nothing is sent to GitHub
// Pages or synchronized with your friends' browsers.
const STORAGE_KEY = 'TraBillSummary:v0.3.6:trip';
let saveTimer = null; // Holds the ID of a pending delayed save.
let storageAvailable = true;

// Collect only the DATA needed to reconstruct the app. Never save DOM elements
// or temporary editor states such as which dialog is currently open.
function snapshotTrip(){
  return {
    schemaVersion: 1,
    people: [...PEOPLE], colors: [...COLORS],
    groups: GROUPS.map(g => ({id:g.id,name:g.name,memberIds:[...g.memberIds]})),
    nextGroupId,
    bills: bills.map(b => ({...b,participants:[...b.participants]})),
    selectedId, groupFilter,
    sourceCurrency, settlementCurrency,
    ratesToCNY: {...ratesToCNY}
  };
}

// Saving on every keystroke is unnecessary. A "debounce" resets the timer
// each time an edit happens, then writes once after the user stops typing.
function scheduleSave(){
  if(!storageAvailable)return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveNow,300);
}
function saveNow(){
  clearTimeout(saveTimer);
  saveTimer=null;
  if(!storageAvailable)return;
  try {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshotTrip()));
    updateSaveStatus('Saved in this browser');
  } catch(error) {
    // Browsers can disable storage (private mode, policies, full quota).
    storageAvailable=false;
    updateSaveStatus('Autosave unavailable — changes may be lost');
    console.warn('TripTab autosave failed:',error);
  }
}
function updateSaveStatus(message){
  const element=document.getElementById('save-status');
  if(element)element.textContent=message;
}

// Defensive loading: a saved record might be corrupted or from another version.
// Validate its basic shape before replacing our initial demo data.
function restoreTrip(){
  let raw;
  try {raw=localStorage.getItem(STORAGE_KEY);}
  catch(error){storageAvailable=false;updateSaveStatus('Autosave unavailable');return;}
  if(raw===null){updateSaveStatus('Demo data · autosave enabled');return;}
  try {
    const data=JSON.parse(raw);
    if(data.schemaVersion!==1 || !Array.isArray(data.people) ||
       !Array.isArray(data.colors) || data.people.length!==data.colors.length ||
       !Array.isArray(data.groups) || !Array.isArray(data.bills) ||
       !data.people.every(n=>typeof n==='string') ||
       !data.colors.every(c=>PALETTE.includes(c)) ||
       !data.groups.every(g=>typeof g.id==='string' && typeof g.name==='string' &&
         Array.isArray(g.memberIds) && g.memberIds.every(i=>Number.isInteger(i)&&i>=0&&i<data.people.length)) ||
       !data.bills.every(b=>Number.isSafeInteger(b.id) && typeof b.name==='string' &&
         typeof b.payer==='string' && data.people.includes(b.payer) &&
         typeof b.amount==='number' && Number.isFinite(b.amount) && b.amount>=0 &&
         CURRENCIES.includes(b.currency) && validBillDate(b.date) &&
         Array.isArray(b.participants) && b.participants.every(i=>Number.isInteger(i)&&i>=0&&i<data.people.length)) ||
       !data.ratesToCNY || CURRENCIES.some(c=>!(Number(data.ratesToCNY[c])>0)) ||
       !CURRENCIES.includes(data.sourceCurrency) || !CURRENCIES.includes(data.settlementCurrency)) {
      throw new Error('Invalid saved trip data');
    }
    PEOPLE.splice(0,PEOPLE.length,...data.people);
    COLORS.splice(0,COLORS.length,...data.colors);
    GROUPS=data.groups.map(g=>({...g,memberIds:[...g.memberIds]}));
    bills=data.bills.map(b=>({...b,participants:[...b.participants]}));
    nextGroupId=Number.isSafeInteger(data.nextGroupId)?data.nextGroupId:GROUPS.length+1;
    selectedId=bills.some(b=>b.id===data.selectedId)?data.selectedId:(bills[0]?.id??null);
    groupFilter=data.groupFilter==='All'||GROUPS.some(g=>g.id===data.groupFilter)?data.groupFilter:'All';
    sourceCurrency=data.sourceCurrency;
    settlementCurrency=data.settlementCurrency;
    for(const c of CURRENCIES)ratesToCNY[c]=Number(data.ratesToCNY[c]);
    updateSaveStatus('Restored from this browser');
  }catch(error){
    // Leave the saved value untouched so a developer can inspect/recover it.
    updateSaveStatus('Saved data invalid — showing demo data');
    console.warn('Could not restore saved trip:',error);
  }
}

const currencyRate = (from,to) => ratesToCNY[from]/ratesToCNY[to];
const convert = (amount,from,to=settlementCurrency) => amount*currencyRate(from,to);
const moneySymbol = code => ({CNY:'¥',JPY:'¥',USD:'$',EUR:'€',GBP:'£',KRW:'₩',HKD:'HK$',TWD:'NT$'}[code]||'');
function renderCurrencyControls(){
  for(const [id,value] of [['source-currency',sourceCurrency],['settlement-currency',settlementCurrency]]){
    const select=$(id);
    select.innerHTML=CURRENCIES.map(c=>`<option value="${c}" ${c===value?'selected':''}>${c}</option>`).join('');
  }
  const rate=currencyRate(sourceCurrency,settlementCurrency);
  $('exchange-rate').value=Number(rate.toPrecision(10));
  $('exchange-rate').disabled=sourceCurrency===settlementCurrency;
  $('exchange-hint').textContent=`1 ${sourceCurrency} in ${settlementCurrency} · manual demo rate`;
}
const $ = id => document.getElementById(id);
// Search is presentation-only: it never changes saved bills.
let activitySearch = '';
const memberDot = i => `<span class="dot" style="background:${COLORS[i]}"></span>`;
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const current = () => bills.find(b => b.id === selectedId);
const fmt = n => Number(n).toLocaleString("en-US",{maximumFractionDigits:2});
function renderSidebar(){
  // Sidebar chips are rebuilt from the same arrays used by the calculations.
  $('member-list').innerHTML = PEOPLE.map((name,i)=>`<span class="bubble-wrap"><button type="button" class="member member-edit-trigger" data-member="${i}" title="Double-click to edit ${escapeHtml(name)}">${memberDot(i)}<span>${escapeHtml(name)}</span></button><button type="button" class="bubble-delete" data-delete-member="${i}" aria-label="Delete ${escapeHtml(name)}" title="Delete member">×</button></span>`).join('')+'<button type="button" class="add-bubble" id="add-member" title="Add member" aria-label="Add member">+</button>';
  $('group-list').innerHTML = `<span class="bubble-wrap"><button type="button" class="group-button ${groupFilter==='All'?'active':''}" data-group="All">All</button></span>` + GROUPS.map(g=>`<span class="bubble-wrap"><button type="button" class="group-button ${groupFilter===g.id?'active':''}" data-group="${g.id}" title="Click to filter; double-click to edit ${escapeHtml(g.name)}">${escapeHtml(g.name)}</button><button type="button" class="bubble-delete" data-delete-group="${g.id}" aria-label="Delete ${escapeHtml(g.name)}">×</button></span>`).join('')+'<button type="button" class="add-bubble" id="add-group" title="Add group" aria-label="Add group">+</button>';
  renderCurrencyControls();
}
function renderActivities(){
  // Group filtering matches the exact saved participant set, not the group name.
  // Search then narrows the already-filtered results without altering data.
  const filtered = bills.filter(b =>
    (groupFilter==='All'||sameMembers(b.participants,groupById(groupFilter)?.memberIds||[])) &&
    (b.name.toLowerCase().includes(activitySearch) || b.payer.toLowerCase().includes(activitySearch))
  );
  $('activity-count').textContent=`${filtered.length} of ${bills.length} bills`;
  $('activity-list').innerHTML=filtered.map(b=>{
    const tag=groupForBill(b);
    const dots=b.participants.map(i=>memberDot(i)).join('');
    const approx=convert(b.amount,b.currency);
    return `<button type="button" class="activity-card ${selectedId===b.id?'selected':''}" data-id="${b.id}">
      <span class="activity-date"><strong>${escapeHtml(b.date)}</strong><small>${b.participants.length} people</small></span>
      <span class="activity-main"><strong>${escapeHtml(b.name)}</strong><span class="activity-meta"><span class="mini-dots">${dots}</span>${tag?`<span class="group-tag">${escapeHtml(tag.name)}</span>`:''}</span><small>Paid by ${escapeHtml(b.payer)}</small></span>
      <span class="activity-price"><strong>${moneySymbol(b.currency)}${fmt(b.amount)}</strong><small>${b.currency!==settlementCurrency?`≈ ${moneySymbol(settlementCurrency)}${fmt(approx)} ${settlementCurrency}`:settlementCurrency}</small></span>
      <span class="activity-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join('') || '<p class="empty-state">No activities match this group or search.</p>';
}
function renderEditor(){
  const b=current();
  $("duplicate-bill").disabled=!(b);
  $("delete-bill").disabled=!(b);
  if(!b){$("activity-editor").innerHTML='<p class="hint">Select an activity to edit.</p>';return;}
  const opts=(items,value)=>items.map(item=>`<option value="${escapeHtml(item)}" ${item===value?'selected':''}>${escapeHtml(item)}</option>`).join("");
  $("activity-editor").innerHTML=`
    <div class="field"><label for="bill-name">Title</label><input id="bill-name" data-field="name" value="${escapeHtml(b.name)}" /></div>
    <div class="field"><label for="bill-date">Date · yy/mm/dd</label><input id="bill-date" data-field="date" type="text" inputmode="numeric" maxlength="8" placeholder="yy/mm/dd" value="${escapeHtml(b.date)}" aria-describedby="bill-date-hint" /><small id="bill-date-hint" class="field-hint">Date the activity was issued</small></div>
    <div class="editor-grid"><div class="field"><label for="bill-currency">Currency</label><select id="bill-currency" data-field="currency">${opts(CURRENCIES,b.currency)}</select></div>
    <div class="field"><label for="bill-amount">Amount</label><input id="bill-amount" data-field="amount" type="number" min="0" step="any" value="${b.amount}" /></div></div>
    <div class="field"><label for="bill-payer">Payer</label><select id="bill-payer" data-field="payer">${opts(PEOPLE,b.payer)}</select></div>
    <div class="field"><label for="bill-group">Group · participant template</label><select id="bill-group" data-field="group"><option value="">Custom combination</option>${GROUPS.map(g=>`<option value="${g.id}" ${sameMembers(g.memberIds,b.participants)?'selected':''}>${escapeHtml(g.name)}</option>`).join('')}</select><small class="field-hint">Selecting a group copies its current members. Older bills are never changed when groups are edited.</small></div>
    <div class="participants-title"><strong>Participants</strong><button type="button" id="select-all-participants" class="small-outline">Select all</button></div>
    <div class="participant-grid">${PEOPLE.map((name,i)=>`<label class="participant"><input type="checkbox" data-participant="${i}" ${b.participants.includes(i)?'checked':''}/>${memberDot(i)}<span>${escapeHtml(name)}</span></label>`).join('')}</div>`;
}
function settlement(){
  const balances=PEOPLE.map((name,i)=>bills.reduce((sum,b)=>{
    const total=convert(b.amount,b.currency);
    const share=b.participants.includes(i)&&b.participants.length?total/b.participants.length:0;
    return sum+(b.payer===name?total:0)-share;
  },0));
  const debt=balances.map((v,i)=>({i,amount:-v})).filter(x=>x.amount>0.005).sort((a,b)=>b.amount-a.amount);
  const credit=balances.map((v,i)=>({i,amount:v})).filter(x=>x.amount>0.005).sort((a,b)=>b.amount-a.amount);
  const transfers=[];let i=0,j=0;
  while(i<debt.length&&j<credit.length){
    const amount=Math.min(debt[i].amount,credit[j].amount);
    if(amount>0.005)transfers.push({from:PEOPLE[debt[i].i],to:PEOPLE[credit[j].i],amount});
    debt[i].amount-=amount;credit[j].amount-=amount;
    if(debt[i].amount<0.005)i++;
    if(credit[j].amount<0.005)j++;
  }
  return transfers;
}
function renderSettlement(){
  const transfers=settlement();
  $('settlement-count').textContent=`${transfers.length} transfers · ${settlementCurrency}`;
  // Balance = total paid - personal share. Positive means should receive.
  const balances=PEOPLE.map((name,i)=>bills.reduce((sum,b)=>{
    const total=convert(b.amount,b.currency);
    return sum+(b.payer===name?total:0)-(b.participants.includes(i)&&b.participants.length?total/b.participants.length:0);
  },0));
  $('settlement-results').innerHTML=`<div class="balance-grid">${PEOPLE.map((name,i)=>`<div class="balance-card"><span class="balance-person">${memberDot(i)}${escapeHtml(name)}</span><strong class="${balances[i]>=-0.005?'positive':'negative'}">${balances[i]>=0?'+':'−'} ${moneySymbol(settlementCurrency)}${Math.abs(balances[i]).toFixed(2)}</strong><small>${balances[i]>=-0.005?'should receive':'should pay'}</small></div>`).join('')}</div><div class="transfer-list"><h3>Suggested transfers</h3>${transfers.map(t=>`<div class="transfer"><span>${escapeHtml(t.from)} <b>→</b> ${escapeHtml(t.to)}</span><strong>${moneySymbol(settlementCurrency)}${t.amount.toFixed(2)}</strong></div>`).join('')||'<p class="hint">Everyone is settled.</p>'}</div>`;
}
function renderAll(){renderSidebar();renderActivities();renderEditor();renderSettlement();}
// Restore BEFORE the first render so the UI displays saved state immediately.
restoreTrip();
$("activity-list").addEventListener('click',e=>{const button=e.target.closest('[data-id]');if(!button)return;selectedId=Number(button.dataset.id);renderActivities();renderEditor();scheduleSave();});
$("activity-editor").addEventListener('input',e=>{
  const b=current();if(!b)return;
  const field=e.target.dataset.field;
  if(field==='name'){b.name=e.target.value;renderActivities();scheduleSave();}
  else if(field==='amount'){b.amount=Math.max(0,Number(e.target.value)||0);renderActivities();renderSettlement();scheduleSave();}
  else if(field==='date'){e.target.setCustomValidity(validBillDate(e.target.value)?'':'Enter a valid date in yy/mm/dd format.');}
});
$("activity-editor").addEventListener('change',e=>{
  const b=current();if(!b)return;
  const field=e.target.dataset.field;
  if(field==='currency'||field==='payer')b[field]=e.target.value;
  if(field==='group'){
    const g=groupById(e.target.value);
    if(g){b.group=g.name;b.participants=[...g.memberIds];}
  }
  if(field==='date'){
    if(validBillDate(e.target.value)){
      b.date=e.target.value;
      e.target.setCustomValidity('');
      e.target.classList.remove('invalid');
    }else{
      e.target.setCustomValidity('Enter a valid date in yy/mm/dd format.');
      e.target.classList.add('invalid');
      e.target.reportValidity();
      e.target.value=b.date;
      e.target.setCustomValidity('');
      e.target.classList.remove('invalid');
    }
  }
  if(e.target.dataset.participant!==undefined){const i=Number(e.target.dataset.participant);b.participants=e.target.checked?[...new Set([...b.participants,i])]:b.participants.filter(x=>x!==i);renderEditor();}
  renderActivities();renderSettlement();scheduleSave();
});
// A search box is a view-only control; no need to autosave search text.
$('activity-search').addEventListener('input',e=>{
  activitySearch=e.target.value.trim().toLowerCase();
  renderActivities();
});
$('activity-editor').addEventListener('click',e=>{
  if(!e.target.closest('#select-all-participants'))return;
  const b=current();if(!b)return;
  b.participants=PEOPLE.map((_,i)=>i);
  renderEditor();renderActivities();renderSettlement();scheduleSave();
});
$('source-currency').addEventListener('change',e=>{sourceCurrency=e.target.value;renderCurrencyControls();scheduleSave();});
$('settlement-currency').addEventListener('change',e=>{settlementCurrency=e.target.value;renderCurrencyControls();renderActivities();renderSettlement();scheduleSave();});
$('exchange-rate').addEventListener('change',e=>{
  const rate=Number(e.target.value);
  if(!Number.isFinite(rate)||rate<=0){alert('Exchange rate must be greater than zero.');renderCurrencyControls();return;}
  if(sourceCurrency!==settlementCurrency)ratesToCNY[sourceCurrency]=rate*ratesToCNY[settlementCurrency];
  renderCurrencyControls();renderActivities();renderSettlement();scheduleSave();
});
$("add-bill").addEventListener('click',()=>{const id=Math.max(0,...bills.map(b=>b.id))+1;bills.push({id,name:'New activity',amount:0,currency:sourceCurrency,payer:PEOPLE[0],group:GROUPS[0]?.name||'',participants:PEOPLE.map((_,i)=>i),date:todayDate()});selectedId=id;groupFilter='All';renderAll();scheduleSave();$("activity-editor").scrollTop=0;});
$("duplicate-bill").addEventListener('click',()=>{const b=current();if(!b)return;const id=Math.max(0,...bills.map(x=>x.id))+1;bills.push({...b,id,name:b.name+' (copy)',participants:[...b.participants],date:todayDate()});selectedId=id;groupFilter='All';renderAll();scheduleSave();});
$("delete-bill").addEventListener('click',()=>{if(!current())return;bills=bills.filter(b=>b.id!==selectedId);selectedId=bills[0]?.id??null;renderAll();scheduleSave();});
$("settlement-toggle").addEventListener('click',()=>{const result=$("settlement-results");result.hidden=!result.hidden;$("settlement-toggle").setAttribute('aria-expanded',String(!result.hidden));$("settlement-chevron").textContent=result.hidden?'⌃':'⌄';});
renderAll();

// Member editor: event delegation allows double-click on either the dot or name.
function openMemberEditor(i){
  $('member-dialog-title').textContent='Edit member';
  editingMemberIndex=i;
  const dialog=$("member-dialog");
  $("member-name-input").value=PEOPLE[i];
  $("member-name-error").textContent='';
  $("color-options").innerHTML=PALETTE.map((color,index)=>`<button type="button" class="color-choice ${COLORS[i]===color?'chosen':''}" data-color-index="${index}" style="background:${color}" aria-label="Color ${index+1}" aria-pressed="${COLORS[i]===color}"></button>`).join('');
  dialog.showModal();
  $("member-name-input").focus();
  $("member-name-input").select();
}
$("member-list").addEventListener('dblclick',e=>{
  const trigger=e.target.closest('[data-member]');
  if(trigger)openMemberEditor(Number(trigger.dataset.member));
});
$("color-options").addEventListener('click',e=>{
  const button=e.target.closest('[data-color-index]');
  if(!button)return;
  $("color-options").querySelectorAll('.color-choice').forEach(x=>{
    const chosen=x===button;
    x.classList.toggle('chosen',chosen);
    x.setAttribute('aria-pressed',String(chosen));
  });
});
$("member-form").addEventListener('submit',e=>{
  e.preventDefault();
  const i=editingMemberIndex;
  if(i===null)return;
  const newName=$("member-name-input").value.trim();
  if(!newName){$("member-name-error").textContent='Member name cannot be empty.';return;}
  if(PEOPLE.some((p,j)=>j!==i&&p.toLowerCase()===newName.toLowerCase())){
    $("member-name-error").textContent='Member names must be unique.';return;
  }
  const oldName=PEOPLE[i];
  if(i===PEOPLE.length){PEOPLE.push(newName);COLORS.push(PALETTE[PEOPLE.length%PALETTE.length]);}
  else {PEOPLE[i]=newName;bills.forEach(b=>{if(b.payer===oldName)b.payer=newName;});}
  const chosen=$("color-options").querySelector('.color-choice.chosen');
  if(chosen)COLORS[i]=PALETTE[Number(chosen.dataset.colorIndex)];
  $("member-dialog").close();
  editingMemberIndex=null;
  renderAll();scheduleSave();
});
$("member-dialog").addEventListener('close',()=>{editingMemberIndex=null;});

$("cancel-member").addEventListener('click',()=>$("member-dialog").close());

// Bubble actions. Deleting a member who is referenced by any bill is blocked
// to protect historical allocations; remove/reassign their bills first.
$('member-list').addEventListener('click',e=>{
  const del=e.target.closest('[data-delete-member]');
  if(del){
    const i=Number(del.dataset.deleteMember);
    if(bills.some(b=>b.payer===PEOPLE[i]||b.participants.includes(i))){
      alert(`Cannot delete ${PEOPLE[i]} while they are referenced by an activity. Reassign payer and participants first.`);return;
    }
    if(!confirm(`Delete member ${PEOPLE[i]}?`))return;
    PEOPLE.splice(i,1);COLORS.splice(i,1);
    bills.forEach(b=>{b.participants=b.participants.map(j=>j>i?j-1:j);});
    GROUPS.forEach(g=>{g.memberIds=g.memberIds.filter(j=>j!==i).map(j=>j>i?j-1:j);});
    renderAll();scheduleSave();return;
  }
  if(e.target.closest('#add-member')){
    editingMemberIndex=PEOPLE.length;
    $('member-dialog-title').textContent='Add member';
    $('member-name-input').value='';
    $('member-name-error').textContent='';
    $('color-options').innerHTML=PALETTE.map((color,index)=>`<button type="button" class="color-choice ${index===PEOPLE.length%24?'chosen':''}" data-color-index="${index}" style="background:${color}" aria-label="Color ${index+1}" aria-pressed="${index===PEOPLE.length%24}"></button>`).join('');
    $('member-dialog').showModal();$('member-name-input').focus();
  }
});
// Group filters use exact participant combinations, NOT the stored group label.
// This means a bill is shown under the combination it actually uses.
function openGroupEditor(id=null){
  editingGroupId=id;
  const g=id?groupById(id):null;
  $('group-dialog-title').textContent=g?'Edit group':'Add group';
  $('group-name-input').value=g?.name||'';
  $('group-error').textContent='';
  $('group-member-options').innerHTML=PEOPLE.map((name,i)=>`<label class="group-member-choice"><input type="checkbox" data-group-member="${i}" ${g?.memberIds.includes(i)?'checked':''}><span class="dot" style="background:${COLORS[i]}"></span>${escapeHtml(name)}</label>`).join('');
  $('group-dialog').showModal();
  $('group-name-input').focus();
}
$('group-list').addEventListener('dblclick',e=>{
  const btn=e.target.closest('[data-group]');
  if(btn&&btn.dataset.group!=='All')openGroupEditor(btn.dataset.group);
});
$('group-list').addEventListener('click',e=>{
  const del=e.target.closest('[data-delete-group]');
  if(del){
    const id=del.dataset.deleteGroup,g=groupById(id);
    if(!g||!confirm(`Delete group "${g.name}"? Existing bills and their participants will be preserved.`))return;
    GROUPS=GROUPS.filter(x=>x.id!==id);
    if(groupFilter===id)groupFilter='All';
    renderAll();scheduleSave();return;
  }
  if(e.target.closest('#add-group')){openGroupEditor();return;}
  const btn=e.target.closest('[data-group]');
  if(btn){groupFilter=btn.dataset.group;renderSidebar();renderActivities();scheduleSave();}
});
$('group-form').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('group-name-input').value.trim();
  const memberIds=[...$('group-member-options').querySelectorAll('input:checked')].map(x=>Number(x.dataset.groupMember));
  const err=$('group-error');
  if(!name){err.textContent='Enter a group name.';return;}
  if(name.toLowerCase()==='all'||GROUPS.some(g=>g.id!==editingGroupId&&g.name.toLowerCase()===name.toLowerCase())){err.textContent='This group name is already used or reserved.';return;}
  if(memberIds.length===0){err.textContent='Select at least one member.';return;}
  if(GROUPS.some(g=>g.id!==editingGroupId&&sameMembers(g.memberIds,memberIds))){err.textContent='A group with exactly these members already exists.';return;}
  if(editingGroupId){
    const g=groupById(editingGroupId);
    if(g){g.name=name;g.memberIds=[...memberIds];}
  }else{
    const id=`g${nextGroupId++}`;
    GROUPS.push({id,name,memberIds:[...memberIds]});
    groupFilter=id;
  }
  $('group-dialog').close();
  editingGroupId=null;
  renderAll();scheduleSave();
});
$('cancel-group').addEventListener('click',()=>$('group-dialog').close());
$('group-dialog').addEventListener('close',()=>{editingGroupId=null;});

// Save pending edits when the tab is hidden (e.g. switching apps on a phone).
// This is a backup to the 300 ms debounce, not the primary saving mechanism.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden' && saveTimer!==null)saveNow();
});
