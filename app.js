
const BHT_SHEET = {
  spreadsheetId: '15tH6kmrn9PdjdKuITTO1SHYkTtFr_aIyPf0I79I25y0',
  gid: '0',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/15tH6kmrn9PdjdKuITTO1SHYkTtFr_aIyPf0I79I25y0/edit?gid=0'
};

const STATE_CODES = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','District of Columbia':'DC','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY'
};

function normalizeHeader(value){
  return String(value ?? '').replace(/\s+/g,' ').trim();
}
function lookupKey(value){
  return normalizeHeader(value).toLowerCase().replace(/[“”"'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
}
function isBlank(value){ return value === null || value === undefined || String(value).trim() === ''; }
function cleanCell(cell){
  if (!cell) return null;
  const v = cell.f !== undefined && cell.f !== null ? cell.f : cell.v;
  return v === undefined || v === null ? null : v;
}
function gvizRows(response){
  if (!response || response.status === 'error' || !response.table) {
    const msg = response?.errors?.map(e => e.detailed_message || e.message).filter(Boolean).join('; ') || 'Google Sheets returned no table.';
    throw new Error(msg);
  }
  const labels = response.table.cols.map((c,i)=>normalizeHeader(c.label || c.id || `Column ${i+1}`));
  return response.table.rows.map(r=>{
    const obj={};
    labels.forEach((label,i)=>{ if(label) obj[label]=cleanCell(r.c?.[i]); });
    return obj;
  }).filter(r=>Object.values(r).some(v=>!isBlank(v)));
}
function loadGviz(headers){
  return new Promise((resolve,reject)=>{
    const callback = `__bhtSheet_${Date.now()}_${headers}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    let settled=false;
    const cleanup=()=>{ delete window[callback]; script.remove(); };
    const timer=setTimeout(()=>{ if(!settled){settled=true;cleanup();reject(new Error('Timed out while loading the published Google Sheet.'));}},15000);
    window[callback]=(response)=>{
      if(settled) return;
      settled=true; clearTimeout(timer);
      try{ const rows=gvizRows(response); cleanup(); resolve(rows); }
      catch(err){ cleanup(); reject(err); }
    };
    script.onerror=()=>{ if(!settled){settled=true;clearTimeout(timer);cleanup();reject(new Error('Could not reach the published Google Sheet.'));} };
    const tqx=encodeURIComponent(`out:json;responseHandler:${callback}`);
    script.src=`https://docs.google.com/spreadsheets/d/${BHT_SHEET.spreadsheetId}/gviz/tq?gid=${encodeURIComponent(BHT_SHEET.gid)}&headers=${headers}&tqx=${tqx}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}
function rowHasState(rows){
  return rows.some(row=>Object.keys(row).some(k=>lookupKey(k)==='state') && !isBlank(valueByAliases(row,['State'])));
}
async function loadPublishedRows(){
  if (Array.isArray(window.__BHT_TEST_DATA__)) return window.__BHT_TEST_DATA__;
  let lastError=null;
  for (const headers of [1,2]) {
    try {
      const rows=await loadGviz(headers);
      if(rowHasState(rows)) return rows;
    } catch(err){ lastError=err; }
  }
  throw lastError || new Error('Could not identify a State column in the published sheet. Make sure the published tab has a State header row.');
}
function valueByAliases(row, aliases){
  const idx={}; Object.entries(row).forEach(([k,v])=>idx[lookupKey(k)]=v);
  for(const alias of aliases){ const key=lookupKey(alias); if(Object.prototype.hasOwnProperty.call(idx,key)) return idx[key]; }
  return null;
}
function ynCategory(value){
  if(isBlank(value)) return null;
  const s=String(value).trim(); const l=s.toLowerCase();
  if(l.startsWith('yes')) return 'Yes';
  if(l.startsWith('no')) return 'No';
  if(l.startsWith('varies')) return 'Varies';
  if(l.startsWith('unclear')) return 'Unclear';
  if(l.startsWith('not applicable')) return 'Not applicable';
  return 'Needs dropdown selection';
}
function abaCategory(primary, fallback){
  const raw=!isBlank(primary)?String(primary).trim():(!isBlank(fallback)?String(fallback).trim():'');
  if(!raw) return null;
  const l=raw.toLowerCase();
  if(l.includes('no specific') || l.startsWith('no --') || l==='no') return 'No — ABA not specifically mentioned';
  if(l.startsWith('2.') || l.includes('aba + other') || l.includes('aba and other') || l.includes('mentions aba and other')) return 'Yes — ABA + other models/language';
  if(l.startsWith('1.') || l.includes('only mentions aba') || l.includes('only aba') || l==='aba' || l.startsWith('aba ' ) || l.startsWith('aba/') || l.startsWith('aba"')) return 'Yes — ABA specifically mentioned';
  if(l.includes('aba')) return 'Yes — ABA specifically mentioned';
  return raw;
}
function normalizeOtherModels(value){
  if(isBlank(value)) return null;
  const s=String(value).trim(); const l=s.toLowerCase();
  if(l.startsWith('yes')) return 'Yes';
  if(l.startsWith('no')) return 'No';
  return s;
}
function sourceUrls(d){
  const candidates=[d['Medicaid Source URL'],d['Private Insurance Source URL'],d['Provider Requirements Source URL']];
  const seen=new Set();
  return candidates.flatMap(v=>isBlank(v)?[]:String(v).split(/\s+/).filter(x=>/^https?:\/\//i.test(x))).map(x=>x.replace(/[),.;]+$/,'' )).filter(x=>!seen.has(x)&&(seen.add(x),true));
}
function canonicalizeRow(raw){
  const get=(...names)=>valueByAliases(raw,names);
  const state=get('State');
  if(isBlank(state)) return null;
  const d={
    'State': state,
    'Any Overall Notes': get('Any Overall Notes'),
    'Medicaid Covers BHT?': get('Medicaid Covers BHT?'),
    'Medicaid Authority': get('Medicaid Authority'),
    'State-Specific Medicaid Program Names or Medicaid Waiver Program': get('State-Specific Medicaid Program Names or Medicaid Waiver Program'),
    'Medicaid Specifically Includes': get('Medicaid Specifically Includes'),
    'Medicaid Dollar / Hour Limit (if applicable)': get('Medicaid Dollar / Hour Limit (if applicable)'),
    'Any Medicaid Notes': get('Any Medicaid Notes'),
    'Medicaid Source URL': get('Medicaid Source URL'),
    'Private Insurance Mandate?': get('Private Insurance Mandate?'),
    'Insurance Law / Citation': get('Insurance Law / Citation'),
    'Effective Year': get('Effective Year'),
    'Other Language or Specific BHT Models Mentioned (If blank, N/A)': get('Other Language or Specific BHT Models Mentioned (If blank, N/A)','Other Language or Specific BHT Models Mentioned'),
    'Private Specifically Includes (Direct Quotes)': get('Private Specifically Includes (Direct Quotes)'),
    'Private Age Limit': get('Private Age Limit'),
    'Private Dollar / Hour Limit': get('Private Dollar / Hour Limit'),
    'Private Exceptions / Plan Limits': get('Private Exceptions / Plan Limits'),
    'Private Insurance Source URL': get('Private Insurance Source URL'),
    'Does the State Have a License for Providers?': get('Does the State Have a License for Providers?'),
    'Does the State Have a Separate Certification for Providers?': get('Does the State Have a Separate Certification for Providers?'),
    'Does the State Have a License or Certification for Practitioners Supervised by Providers?': get('Does the State Have a License or Certification for Practitioners Supervised by Providers?'),
    'Does the State Have Any Other Special Requirements?': get('Does the State Have Any Other Special Requirements?'),
    'Provider Requirements Source URL': get('Provider Requirements Source URL'),
    'Provider Requirements Notes': get('Provider Requirements Notes')
  };
  const abaPrimary=get('Mentions ABA specifically?','Mentions ABA Specifically?');
  const abaFallback=get('Meniotions ABA Specifically?','ABA Mention Category');
  d['ABA Mention Category']=abaCategory(abaPrimary,abaFallback);
  d['Other BHT Models Category']=normalizeOtherModels(get('Specifcally Names Other BHT Models in addition to ABA?','Specifically Names Other BHT Models in addition to ABA?','Other BHT Models Category'));
  d['Provider License Category']=ynCategory(d['Does the State Have a License for Providers?']);
  d['Provider Certification Category']=ynCategory(d['Does the State Have a Separate Certification for Providers?']);
  d['Supervised Practitioner Category']=ynCategory(d['Does the State Have a License or Certification for Practitioners Supervised by Providers?']);
  d['State Display']=String(state).trim();
  d['State Code']=STATE_CODES[d['State Display']] || d['State Display'].slice(0,2).toUpperCase();
  d['Source URLs']=sourceUrls(d);
  return d;
}
function updateLiveStatus(ok, text){
  const notice=document.getElementById('dataNotice');
  const status=document.getElementById('dataStatus');
  if(!notice || !status) return;
  notice.classList.remove('error','success');
  notice.classList.add(ok?'success':'error');
  notice.querySelector('b').textContent=ok?'Live data connected.':'Data connection problem.';
  status.textContent=text;
}
function updateStats(DATA){
  const yes=v=>String(v??'').trim().toLowerCase().startsWith('yes');
  const abaYes=v=>String(v??'').trim().toLowerCase().startsWith('yes');
  const set=(id,n)=>{const e=document.getElementById(id);if(e)e.textContent=String(n)};
  set('statJurisdictions',DATA.length);
  set('statMedicaid',DATA.filter(d=>yes(d['Medicaid Covers BHT?'])).length);
  set('statPrivate',DATA.filter(d=>yes(d['Private Insurance Mandate?'])).length);
  set('statAba',DATA.filter(d=>abaYes(d['ABA Mention Category'])).length);
  set('statOtherModels',DATA.filter(d=>yes(d['Other BHT Models Category'])).length);
}

function initExplorer(DATA){
const HIDDEN_COLUMNS=[];
updateStats(DATA);
const $=id=>document.getElementById(id), byState=Object.fromEntries(DATA.map(d=>[d['State Display'],d]));
let current=byState['California']||DATA[0], activeTab='overview', compareStates=['California','Texas','New York'].filter(x=>byState[x]), compareTab='overview';
if(compareStates.length<2)compareStates=DATA.slice(0,2).map(d=>d['State Display']);
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function display(v){return v===null||v===undefined||String(v).trim()===''?'Not yet coded':String(v)}
function cls(v){const s=display(v).toLowerCase();if(s.startsWith('yes'))return'yes';if(s.startsWith('no'))return'no';if(s.includes('not yet'))return'blank';if(s.includes('needs dropdown'))return'warn';return'info'}
function pill(v){return node('span','pill '+cls(v),display(v))}
function mini(k,v,isPill=false){const e=node('div','mini');e.append(node('div','k',k));const x=node('div','v');if(isPill)x.append(pill(v));else x.textContent=display(v);e.append(x);return e}
function sec(label,v){const s=node('div','section');s.append(node('div','label',label),node('div','value'+((v===null||v===undefined||String(v).trim()==='')?' empty':''),display(v)));return s}
function optionalSec(label,v){const s=node('div','section');s.append(node('div','label',label));const raw=(v===null||v===undefined)?'':String(v).trim();s.append(node('div','value',raw));return s}
function codedSec(label,category,detail){const s=node('div','section');s.append(node('div','label',label));const c=node('div','coded');c.append(pill(category));s.append(c);if(detail && display(detail)!==display(category)){const de=document.createElement('details');de.className='detailFold';de.append(node('summary','','View underlying research detail'));de.append(node('div','value',display(detail)));s.append(de)}return s}
function fields(tab){
 if(tab==='overview') return [['Overall notes','Any Overall Notes']];
 if(tab==='medicaid') return [['Medicaid covers BHT?','Medicaid Covers BHT?'],['Medicaid authority','Medicaid Authority'],['State-specific Medicaid program / waiver','State-Specific Medicaid Program Names or Medicaid Waiver Program'],['Medicaid specifically includes','Medicaid Specifically Includes'],['Dollar / hour limit','Medicaid Dollar / Hour Limit (if applicable)'],['Medicaid notes','Any Medicaid Notes']];
 if(tab==='private') return [['Private insurance mandate?','Private Insurance Mandate?'],['Insurance law / citation','Insurance Law / Citation'],['Effective year','Effective Year'],['ABA mentioned specifically?','ABA Mention Category'],['Other BHT models named in addition to ABA?','Other BHT Models Category'],['Other language / BHT models mentioned','Other Language or Specific BHT Models Mentioned (If blank, N/A)'],['Private specifically includes / direct quotes','Private Specifically Includes (Direct Quotes)'],['Private age limit','Private Age Limit'],['Private dollar / hour limit','Private Dollar / Hour Limit'],['Private exceptions / plan limits','Private Exceptions / Plan Limits']];
 return [];
}
const providerFields=[
 ['State license for providers?','Provider License Category','Does the State Have a License for Providers?'],
 ['Separate certification for providers?','Provider Certification Category','Does the State Have a Separate Certification for Providers?'],
 ['Credential for supervised practitioners?','Supervised Practitioner Category','Does the State Have a License or Certification for Practitioners Supervised by Providers?']
];
function renderTiles(){const box=$('tiles');box.textContent='';DATA.forEach(d=>{const b=node('button','stateBtn');if(current&&current['State Display']===d['State Display'])b.classList.add('active');b.append(node('span','code',d['State Code']),node('span','name',d['State Display']));b.title=d['State Display'];b.onclick=()=>setState(d['State Display']);box.append(b)})}
function setState(name){current=byState[name]||DATA[0];$('stateSelect').value=current['State Display'];renderTiles();renderState()}
function renderState(){$('stateName').textContent=current['State Display'];const s=$('summary');s.textContent='';s.append(mini('Medicaid covers BHT?',current['Medicaid Covers BHT?'],true),mini('Private mandate?',current['Private Insurance Mandate?'],true),mini('ABA mentioned specifically?',current['ABA Mention Category'],true),mini('Other BHT models?',current['Other BHT Models Category'],true),mini('Provider license?',current['Provider License Category'],true),mini('Effective year',current['Effective Year']));renderDetails()}
function renderDetails(){const b=$('details');b.textContent='';if(activeTab==='sources'){const s=node('div','section');s.append(node('div','label','Source links'));const links=node('div','sourceBtns');(current['Source URLs']||[]).forEach((u,i)=>{const a=node('a','sourceBtn','Open source '+(i+1)+' ↗');a.href=u;a.target='_blank';a.rel='noopener noreferrer';links.append(a)});if(!(current['Source URLs']||[]).length)links.append(node('div','value empty','No source URL captured for this row.'));s.append(links);b.append(s);return}if(activeTab==='providers'){providerFields.forEach(([lab,cat,detail])=>b.append(codedSec(lab,current[cat],current[detail])));b.append(optionalSec('Other special requirements',current['Does the State Have Any Other Special Requirements?']));b.append(sec('Provider requirements notes',current['Provider Requirements Notes']));return}fields(activeTab).forEach(([lab,key])=>b.append(sec(lab,current[key])))}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');activeTab=t.dataset.tab;renderDetails()});
const sel=$('stateSelect');DATA.forEach(d=>{const o=document.createElement('option');o.value=d['State Display'];o.textContent=d['State Display'];sel.append(o)});sel.onchange=e=>setState(e.target.value);
function addOptions(id, values){const s=$(id);[...new Set(values.map(display))].sort().forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;s.append(o)})}
addOptions('medicaidFilter',DATA.map(d=>d['Medicaid Covers BHT?']));addOptions('authorityFilter',DATA.map(d=>d['Medicaid Authority']));addOptions('mandateFilter',DATA.map(d=>d['Private Insurance Mandate?']));addOptions('abaFilter',DATA.map(d=>d['ABA Mention Category']));addOptions('otherModelsFilter',DATA.map(d=>d['Other BHT Models Category']));addOptions('licenseFilter',DATA.map(d=>d['Provider License Category']));addOptions('certFilter',DATA.map(d=>d['Provider Certification Category']));addOptions('supervisedFilter',DATA.map(d=>d['Supervised Practitioner Category']));
function renderTable(){const q=$('search').value.trim().toLowerCase(), filters=[['Medicaid Covers BHT?',$('medicaidFilter').value],['Medicaid Authority',$('authorityFilter').value],['Private Insurance Mandate?',$('mandateFilter').value],['ABA Mention Category',$('abaFilter').value],['Other BHT Models Category',$('otherModelsFilter').value],['Provider License Category',$('licenseFilter').value],['Provider Certification Category',$('certFilter').value],['Supervised Practitioner Category',$('supervisedFilter').value]], tb=$('tbody');tb.textContent='';const matches=DATA.filter(d=>{const hay=Object.entries(d).filter(([k,v])=>!HIDDEN_COLUMNS.includes(k)&&typeof v==='string').map(x=>x[1]).join(' ').toLowerCase();if(q&&!hay.includes(q))return false;for(const [f,v] of filters){if(v&&display(d[f])!==v)return false}return true});matches.forEach(d=>{const tr=node('tr','click');tr.onclick=()=>{setState(d['State Display']);showSingle();window.scrollTo({top:$('singleMode').offsetTop-10,behavior:'smooth'})};const cells=[['text',d['State Display']],['pill',d['Medicaid Covers BHT?']],['text',display(d['Medicaid Authority'])],['pill',d['Private Insurance Mandate?']],['pill',d['ABA Mention Category']],['pill',d['Other BHT Models Category']],['pill',d['Provider License Category']],['text',display(d['Effective Year'])]];cells.forEach(([type,v])=>{const td=node('td');if(type==='pill')td.append(pill(v));else td.textContent=v;tr.append(td)});tb.append(tr)});$('countNote').textContent='Showing '+matches.length+' of '+DATA.length+' jurisdictions.'}
['search','medicaidFilter','authorityFilter','mandateFilter','abaFilter','otherModelsFilter','licenseFilter','certFilter','supervisedFilter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',renderTable));
function showSingle(){$('singleMode').classList.remove('hidden');$('compareMode').classList.remove('active');$('singleModeBtn').classList.add('active');$('compareModeBtn').classList.remove('active')}
function showCompare(){$('singleMode').classList.add('hidden');$('compareMode').classList.add('active');$('singleModeBtn').classList.remove('active');$('compareModeBtn').classList.add('active');renderCompare()}
$('singleModeBtn').onclick=showSingle;$('compareModeBtn').onclick=showCompare;
const ca=$('compareAdd');DATA.forEach(d=>{const o=document.createElement('option');o.value=d['State Display'];o.textContent=d['State Display'];ca.append(o)});ca.value=DATA.find(d=>!compareStates.includes(d['State Display']))?.['State Display']||DATA[0]['State Display'];
$('addCompare').onclick=()=>{const v=ca.value;if(v&&!compareStates.includes(v)){compareStates.push(v);renderCompare()}};$('clearCompare').onclick=()=>{compareStates=['California','Texas','New York'].filter(x=>byState[x]);if(compareStates.length<2)compareStates=DATA.slice(0,2).map(d=>d['State Display']);renderCompare()};$('diffOnly').onchange=renderCompareTable;
document.querySelectorAll('.compareTab').forEach(t=>t.onclick=()=>{document.querySelectorAll('.compareTab').forEach(x=>x.classList.remove('active'));t.classList.add('active');compareTab=t.dataset.ctab;renderCompareTable()});
function compareFields(tab){if(tab==='overview')return [['Medicaid covers BHT?','Medicaid Covers BHT?','pill'],['Medicaid authority','Medicaid Authority','text'],['Private mandate?','Private Insurance Mandate?','pill'],['ABA mentioned specifically?','ABA Mention Category','pill'],['Other BHT models named?','Other BHT Models Category','pill'],['Provider license?','Provider License Category','pill'],['Separate provider certification?','Provider Certification Category','pill'],['Supervised-practitioner credential?','Supervised Practitioner Category','pill'],['Effective year','Effective Year','text']];if(tab==='providers')return [...providerFields.map(x=>[x[0],x[2],'text']),['Other special requirements','Does the State Have Any Other Special Requirements?','optionalText']];return fields(tab).map(x=>[x[0],x[1],(['Medicaid Covers BHT?','Private Insurance Mandate?','ABA Mention Category','Other BHT Models Category'].includes(x[1])?'pill':'text')])}
function renderCompare(){const chips=$('compareChips');chips.textContent='';compareStates.forEach(st=>{const c=node('span','chip',st);const b=node('button','','×');b.title='Remove '+st;b.disabled=compareStates.length<=2;b.style.opacity=compareStates.length<=2?'.35':'1';b.onclick=()=>{if(compareStates.length<=2)return;compareStates=compareStates.filter(x=>x!==st);renderCompare()};c.append(b);chips.append(c)});const q=$('compareQuick');q.textContent='';compareStates.forEach(st=>{const d=byState[st],c=node('div','compareStateCard');c.append(node('h3','',st),mini('Medicaid BHT',d['Medicaid Covers BHT?'],true),mini('Private mandate',d['Private Insurance Mandate?'],true),mini('ABA mentioned?',d['ABA Mention Category'],true),mini('Provider license',d['Provider License Category'],true));q.append(c)});renderCompareTable()}
function renderCompareTable(){const h=$('compareHead'),b=$('compareBody');h.textContent='';b.textContent='';const tr=document.createElement('tr');tr.append(node('th','','Field'));compareStates.forEach(st=>tr.append(node('th','',st)));h.append(tr);compareFields(compareTab).forEach(([lab,key,type])=>{const vals=compareStates.map(st=>display(byState[st][key]));if($('diffOnly').checked && new Set(vals).size<=1)return;const r=document.createElement('tr');r.append(node('td','',lab));compareStates.forEach(st=>{const td=document.createElement('td'),v=byState[st][key];if(type==='pill')td.append(pill(v));else if(type==='optionalText'){const raw=(v===null||v===undefined)?'':String(v).trim();td.append(node('div','compareCell',raw))}else td.append(node('div','compareCell'+((v===null||v===undefined||String(v).trim()==='')?' empty':''),display(v)));r.append(td)});b.append(r)})}
setState(current['State Display']);renderTable();renderCompare();if(new URLSearchParams(location.search).get('mode')==='compare')showCompare();
}

async function boot(){
  try{
    const raw=await loadPublishedRows();
    const DATA=raw.map(canonicalizeRow).filter(Boolean).sort((a,b)=>a['State Display'].localeCompare(b['State Display']));
    if(!DATA.length) throw new Error('The published sheet loaded, but no state rows were found.');
    updateLiveStatus(true, `Loaded ${DATA.length} jurisdictions from the published sheet. Refresh this page after editing Google Sheets to load the latest published values.`);
    initExplorer(DATA);
  }catch(err){
    console.error(err);
    updateLiveStatus(false, `${err.message} Check that the intended tab is still published to the web and that its first data column is State.`);
    document.querySelectorAll('select,input,button').forEach(el=>{ if(![''].includes(el.id)) el.disabled=true; });
  }
}
boot();
