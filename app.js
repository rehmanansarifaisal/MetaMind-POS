
(function(){
  const state = {
    screen: 'dashboard',
    data: {},
    filters: {},
    selectedProductId: null,
    selectedInvoiceId: null,
    currentUser: null,
    permissions: {},
    trialExpired: false,
    seedDone: false,
    cart: [],
    pendingImport: null,
  };

  const menu = [
    ['Main', [
      ['dashboard','Dashboard','LIVE'],
      ['pos','POS Billing','F1'],
      ['products','Products','CRUD'],
      ['categories','Categories','CAT'],
      ['brands','Brands','BRD'],
      ['units','Units','UOM'],
      ['suppliers','Suppliers','LED'],
      ['customers','Customers','KHATA'],
      ['inventory','Inventory','STK'],
      ['lowstock','Low Stock','ALERT'],
      ['negativestock','Negative Stock','N/A'],
      ['purchase','Purchase / GRN','GRN'],
      ['returns','Returns','RTN'],
      ['reports','Reports','RPT'],
      ['users','Users','ACL'],
      ['settings','Settings','CFG'],
      ['audit','Audit Logs','LOG'],
      ['backup','Backup','BKP'],
      ['credits','Credits','DEV']
    ]]
  ];

  const $ = (sel, root=document)=>root.querySelector(sel);
  const $$ = (sel, root=document)=>Array.from(root.querySelectorAll(sel));
  const els = {};
  function setTitle(title, hint=''){ $('#screenTitle').textContent = title; $('#screenHint').textContent = hint; }

  function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function fmt(n){ const x = Number(n||0); return x.toLocaleString(undefined,{maximumFractionDigits:2}); }
  function money(n){ return 'Rs ' + fmt(n); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function addDays(dateISO, days){ const d = new Date(dateISO); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }

  function audit(action, details=''){
    return MetaDB.put('auditLogs', { id: MetaUtil.uid('LOG'), action, details, createdAt: MetaUtil.nowISO(), user: state.currentUser?.username || 'system' });
  }

  async function seed(){
    const settings = await MetaDB.getAll('settings');
    if(settings.length===0){
      await MetaDB.bulkPut('settings', [
        {id:'company', key:'company', value:{ name:'MetaMind Tech', address:'', phone:'', email:'', website:'', footer:'© MetaMind Tech POS', logo:'' }},
        {id:'ui', key:'ui', value:{ theme:'dark', density:'comfortable' }},
        {id:'printer', key:'printer', value:{ thermal:'ESC/POS', report:'A4', autoCut:true }},
        {id:'license', key:'license', value:{ activated:false, type:'trial-30', startedAt: todayISO(), endsAt: addDays(todayISO(), 30), deviceLock:'', superAdminOnly:false }},
        {id:'dbmode', key:'dbmode', value:{ mode:'sqlite-local' }}
      ]);
    }
    const users = await MetaDB.getAll('users');
    if(users.length===0){
      await MetaDB.put('users', { id:'admin', username:'admin', name:'Super Admin', password:'admin', pin:'1234', role:'superadmin', active:true, permissions:{'*':true}, createdAt:MetaUtil.nowISO() });
    }
    const license = await getSetting('license');
    const company = await getSetting('company');
    if(company && !company.value.name) { company.value.name='MetaMind Tech'; await MetaDB.put('settings', company); }
    if(!license.value.startedAt) {
      license.value.startedAt = todayISO(); license.value.endsAt = addDays(todayISO(), 30); await MetaDB.put('settings', license);
    }
    const cats = await MetaDB.getAll('categories');
    if(cats.length===0){
      await MetaDB.bulkPut('categories', [
        {id: MetaUtil.uid('CAT'), name:'General', parentId:'', icon:'📦', active:true},
        {id: MetaUtil.uid('CAT'), name:'Grocery', parentId:'', icon:'🛒', active:true},
        {id: MetaUtil.uid('CAT'), name:'Electronics', parentId:'', icon:'💻', active:true}
      ]);
    }
    const brs = await MetaDB.getAll('brands');
    if(brs.length===0){
      await MetaDB.bulkPut('brands', [
        {id: MetaUtil.uid('BRD'), name:'No Brand', logo:'', notes:''},
        {id: MetaUtil.uid('BRD'), name:'MetaBrand', logo:'', notes:''}
      ]);
    }
    const units = await MetaDB.getAll('units');
    if(units.length===0){
      await MetaDB.bulkPut('units', [
        {id: MetaUtil.uid('UNT'), name:'PCS', short:'pcs'},
        {id: MetaUtil.uid('UNT'), name:'KG', short:'kg'},
        {id: MetaUtil.uid('UNT'), name:'LITER', short:'ltr'},
        {id: MetaUtil.uid('UNT'), name:'BOX', short:'box'}
      ]);
    }
    const products = await MetaDB.getAll('products');
    if(products.length===0){
      const cat = (await MetaDB.getAll('categories'))[0];
      const brand = (await MetaDB.getAll('brands'))[0];
      const unit = (await MetaDB.getAll('units'))[0];
      await MetaDB.bulkPut('products', [
        {id: MetaUtil.uid('PRD'), name:'Sample Tea 100g', barcode:'1001001', sku:'TEA100', categoryId:cat?.id||'', brandId:brand?.id||'', unitId:unit?.id||'', costPrice:80, salePrice:100, qty:25, threshold:5, notes:'Demo item', status:'active'},
        {id: MetaUtil.uid('PRD'), name:'Sample Rice 1kg', barcode:'1001002', sku:'RIC1KG', categoryId:cat?.id||'', brandId:brand?.id||'', unitId:unit?.id||'', costPrice:220, salePrice:260, qty:12, threshold:4, notes:'Demo item', status:'active'}
      ]);
    }
    if((await MetaDB.getAll('suppliers')).length===0){
      await MetaDB.put('suppliers', { id: MetaUtil.uid('SUP'), name:'Default Supplier', phone:'', email:'', address:'', notes:'', active:true });
    }
    if((await MetaDB.getAll('customers')).length===0){
      await MetaDB.put('customers', { id: MetaUtil.uid('CUS'), name:'Walk-in Customer', phone:'', email:'', address:'', notes:'', balance:0, active:true });
    }
  }

  async function getSetting(key){
    const all = await MetaDB.getAll('settings');
    return all.find(x=>x.key===key) || null;
  }
  async function setSetting(key, value){
    const all = await MetaDB.getAll('settings');
    let row = all.find(x=>x.key===key);
    if(!row) row = { id:key, key, value };
    row.value = value;
    await MetaDB.put('settings', row);
    return row;
  }

  function can(permission){
    if(!state.currentUser) return false;
    if(state.currentUser.role==='superadmin') return true;
    if(state.currentUser.permissions?.['*']) return true;
    return !!state.currentUser.permissions?.[permission];
  }

  async function loadAll(){
    const names = ['settings','categories','brands','units','products','suppliers','customers','purchaseInvoices','salesInvoices','returns','users','auditLogs','inventoryMovements','license','backups'];
    for(const n of names) state.data[n] = await MetaDB.getAll(n);
  }

  function productById(id){ return state.data.products.find(p=>p.id===id); }
  function categoryById(id){ return state.data.categories.find(x=>x.id===id); }
  function brandById(id){ return state.data.brands.find(x=>x.id===id); }
  function unitById(id){ return state.data.units.find(x=>x.id===id); }
  function supplierById(id){ return state.data.suppliers.find(x=>x.id===id); }
  function customerById(id){ return state.data.customers.find(x=>x.id===id); }

  function calcProductStats(pid){
    const inv = state.data.inventoryMovements.filter(m=>m.productId===pid);
    let purchased=0,sold=0,returned=0,reserved=0;
    inv.forEach(m=>{
      if(m.type==='PURCHASE') purchased += Number(m.qty||0);
      if(m.type==='SALE') sold += Number(m.qty||0);
      if(m.type==='RETURN_IN') returned += Number(m.qty||0);
      if(m.type==='RESERVE') reserved += Number(m.qty||0);
      if(m.type==='RETURN_OUT') sold -= Number(m.qty||0);
      if(m.type==='ADJUST') purchased += Number(m.qty||0);
    });
    const p = productById(pid);
    const current = p ? Number(p.qty||0) : 0;
    return { current, sold, purchased, returned, reserved };
  }

  function fullSearchRow(cols, values){
    return cols.map((c,i)=>`<th><input class="input table-filter" data-key="${c.key}" placeholder="${c.label}" value="${escapeHtml(values[c.key]||'')}" /></th>`).join('') + '<th>Actions</th>';
  }

  function filterRecords(records, filters){
    return records.filter(r=>{
      for(const [k,v] of Object.entries(filters||{})){
        if(!v) continue;
        const field = String((r[k]??'')).toLowerCase();
        if(!field.includes(String(v).toLowerCase())) return false;
      }
      return true;
    });
  }

  function screenShell(title, hint, body){
    setTitle(title,hint);
    return body;
  }

  function badgeStock(qty, threshold){
    if(qty < 0) return `<span class="badge danger">Negative</span>`;
    if(qty <= threshold) return `<span class="badge warn">Low</span>`;
    return `<span class="badge good">OK</span>`;
  }

  function renderMenu(){
    const menuEl = $('#menu');
    menuEl.innerHTML = menu.map(([group, items]) => `
      <div class="menu-group">${group}</div>
      ${items.map(([key, title, badge]) => `
        <button class="menu-item ${state.screen===key?'active':''}" data-screen="${key}">
          <span>${title}</span><span class="menu-badge">${badge}</span>
        </button>`).join('')}
    `).join('');
    $$('.menu-item', menuEl).forEach(btn=>btn.onclick = ()=>go(btn.dataset.screen));
  }

  function go(screen){
    state.screen = screen;
    renderMenu();
    renderScreen();
  }

  async function render(){
    await loadAll();
    renderMenu();
    await renderScreen();
    await checkTrial();
    bindTopActions();
  }

  function bindTopActions(){
    $('#toggleSidebar').onclick = ()=>{
      document.querySelector('.sidebar').classList.toggle('hidden');
    };
    $('#btnQuickSale').onclick = ()=>go('pos');
    $('#btnQuickPurchase').onclick = ()=>go('purchase');
    $('#btnBackup').onclick = ()=>backupNow();
    $('#globalSearch').oninput = ()=>{
      state.filters.global = $('#globalSearch').value.trim();
      if(state.screen==='dashboard') renderScreen();
    };
    document.addEventListener('keydown', shortcutHandler);
  }

  function shortcutHandler(e){
    if(e.key==='F1'){ e.preventDefault(); if(state.screen==='pos') focusPosSearch(); else go('pos'); }
    if(e.key==='F2'){ e.preventDefault(); const save = $('[data-save]'); if(save) save.click(); }
    if(e.key==='F3'){ e.preventDefault(); const hold = $('[data-hold]'); if(hold) hold.click(); }
    if(e.key==='F4'){ e.preventDefault(); const pay = $('[data-pay]'); if(pay) pay.click(); }
    if(e.key==='F5'){ e.preventDefault(); renderScreen(); }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='p'){ e.preventDefault(); window.print(); }
  }

  async function checkTrial(){
    const licRow = await getSetting('license');
    const lic = licRow?.value || {};
    const now = todayISO();
    const expired = !!lic.endsAt && now > lic.endsAt && !lic.activated;
    state.trialExpired = expired;
    if(expired){
      showAlert(`Trial expired on ${lic.endsAt}. Only Super Admin can operate until activation.`, 'warn');
    }
  }

  function showAlert(msg, type='warn'){
    $('#alerts').innerHTML = `<div class="alert">${escapeHtml(msg)}</div>`;
    setTimeout(()=>{ if($('#alerts').innerHTML.includes(escapeHtml(msg))) $('#alerts').innerHTML = ''; }, 4500);
  }

  async function renderScreen(){
    await loadAll();
    renderMenu();
    const screen = $('#screen');
    const g = state.filters.global?.toLowerCase() || '';
    if(state.screen==='dashboard') screen.innerHTML = await renderDashboard(g);
    else if(state.screen==='pos') screen.innerHTML = await renderPOS();
    else if(state.screen==='products') screen.innerHTML = await renderProducts();
    else if(state.screen==='categories') screen.innerHTML = await renderCrud('categories');
    else if(state.screen==='brands') screen.innerHTML = await renderCrud('brands');
    else if(state.screen==='units') screen.innerHTML = await renderCrud('units');
    else if(state.screen==='suppliers') screen.innerHTML = await renderCrud('suppliers');
    else if(state.screen==='customers') screen.innerHTML = await renderCrud('customers');
    else if(state.screen==='inventory') screen.innerHTML = await renderInventory();
    else if(state.screen==='lowstock') screen.innerHTML = await renderLowStock();
    else if(state.screen==='negativestock') screen.innerHTML = await renderNegativeStock();
    else if(state.screen==='purchase') screen.innerHTML = await renderPurchase();
    else if(state.screen==='returns') screen.innerHTML = await renderReturns();
    else if(state.screen==='reports') screen.innerHTML = await renderReports();
    else if(state.screen==='users') screen.innerHTML = await renderUsers();
    else if(state.screen==='settings') screen.innerHTML = await renderSettings();
    else if(state.screen==='audit') screen.innerHTML = await renderAudit();
    else if(state.screen==='backup') screen.innerHTML = await renderBackup();
    else if(state.screen==='credits') screen.innerHTML = await renderCredits();
    else screen.innerHTML = `<div class="panel">Unknown screen</div>`;
    wireScreen();
  }

  async function renderDashboard(global){
    const sales = state.data.salesInvoices;
    const purchases = state.data.purchaseInvoices;
    const products = state.data.products;
    const low = products.filter(p=>Number(p.qty||0) <= Number(p.threshold||0));
    const neg = products.filter(p=>Number(p.qty||0) < 0);
    const revenue = sales.reduce((a,s)=>a + Number(s.total||0),0);
    const purchaseTotal = purchases.reduce((a,s)=>a + Number(s.total||0),0);
    const profit = revenue - purchases.reduce((a,p)=>a + Number(p.totalCost||0),0);
    const top = [...products].sort((a,b)=>Number(b.qty||0)-Number(a.qty||0)).slice(0,5);
    const recentSales = [...sales].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6);
    const recentPurchase = [...purchases].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6);
    const recentProducts = global ? products.filter(p=>[p.name,p.barcode,p.sku].some(v=>String(v||'').toLowerCase().includes(global))) : products;
    return screenShell('Dashboard', 'Live summary of sales, purchases, stock, and alerts.', `
      <div class="grid cards">
        <div class="card"><div class="label">Revenue</div><div class="value">${money(revenue)}</div><div class="sub">${sales.length} sale invoice(s)</div></div>
        <div class="card"><div class="label">Profit</div><div class="value">${money(profit)}</div><div class="sub">Sales minus cost</div></div>
        <div class="card"><div class="label">Purchases</div><div class="value">${money(purchaseTotal)}</div><div class="sub">${purchases.length} purchase invoice(s)</div></div>
        <div class="card"><div class="label">Stock Value Items</div><div class="value">${products.length}</div><div class="sub">${low.length} low stock, ${neg.length} negative</div></div>
      </div>
      <div class="split" style="margin-top:14px">
        <div class="panel">
          <div class="section-title">Recent Sales Invoices</div>
          <div class="table-wrap">
            <table><thead><tr><th>No</th><th>Date</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>${recentSales.map(s=>`<tr><td>${escapeHtml(s.invoiceNo)}</td><td>${escapeHtml(s.date)}</td><td>${escapeHtml(customerById(s.customerId)?.name || 'Walk-in')}</td><td>${money(s.total)}</td><td><span class="badge good">Sale</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No sales yet</td></tr>'}</tbody></table>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Alerts</div>
          <div class="grid" style="gap:10px">
            <div class="item-card">Low stock: <strong>${low.length}</strong></div>
            <div class="item-card">Negative stock: <strong>${neg.length}</strong></div>
            <div class="item-card">Recent purchases: <strong>${purchases.length}</strong></div>
            <div class="item-card">Top stock item: <strong>${escapeHtml(top[0]?.name || '-')}</strong></div>
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="section-title">Top Products by Quantity</div>
        <div class="table-wrap">
          <table><thead><tr><th>Product</th><th>Current</th><th>Purchased</th><th>Sold</th><th>Returned</th><th>Reserved</th><th>Status</th></tr></thead>
          <tbody>${top.map(p=>{const st=calcProductStats(p.id); return `<tr><td>${escapeHtml(p.name)}</td><td>${fmt(st.current)}</td><td>${fmt(st.purchased)}</td><td>${fmt(st.sold)}</td><td>${fmt(st.returned)}</td><td>${fmt(st.reserved)}</td><td>${badgeStock(st.current,p.threshold||0)}</td></tr>`}).join('')}</tbody></table>
        </div>
      </div>
    `);
  }

  function focusPosSearch(){ const inp = $('#posProductSearch'); if(inp){ inp.focus(); inp.select(); } }

  async function renderPOS(){
    const customers = state.data.customers.filter(c=>c.active!==false);
    const products = state.data.products.filter(p=>p.status!=='inactive');
    const customerOptions = customers.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    const searchVal = state.filters.posSearch || '';
    const list = products.filter(p=>!searchVal || [p.name,p.barcode,p.sku].some(v=>String(v||'').toLowerCase().includes(searchVal.toLowerCase()))).slice(0,80);
    const cartTotal = state.cart.reduce((a,i)=>a + (Number(i.qty)*Number(i.salePrice) * (1 - Number(i.discount||0)/100) * (1 + Number(i.tax||0)/100)),0);
    return screenShell('POS Billing', 'Keyboard-first billing, hold/resume, editable cart, live invoice preview.', `
      <div class="split">
        <div class="panel">
          <div class="toolbar">
            <input id="posProductSearch" class="search" placeholder="Search barcode / name / SKU" value="${escapeHtml(searchVal)}" />
            <select id="posCustomer" class="input" style="max-width:240px">${customerOptions}</select>
            <button class="btn" data-hold>Hold Sale <span class="kbd">F3</span></button>
            <button class="btn btn-primary" data-pay>Pay <span class="kbd">F4</span></button>
          </div>
          <div class="grid" style="grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px">
            ${list.map(p=>{
              const st = calcProductStats(p.id);
              return `<div class="item-card">
                <div style="font-weight:700">${escapeHtml(p.name)}</div>
                <div class="muted">${escapeHtml(p.barcode||'')} | ${escapeHtml(p.sku||'')}</div>
                <div class="muted">Stock: ${fmt(st.current)} | ${money(p.salePrice)}</div>
                <button class="btn" data-add-product="${p.id}" style="margin-top:10px;width:100%">Add</button>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Cart</div>
          <div class="table-wrap">
            <table style="min-width:0"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Disc%</th><th>Tax%</th><th>Line</th><th></th></tr></thead>
            <tbody>
              ${state.cart.map((it,idx)=>`<tr>
                <td>${escapeHtml(productById(it.productId)?.name || '')}</td>
                <td><input class="input cart-edit" data-idx="${idx}" data-field="qty" type="number" step="1" value="${it.qty}" style="width:82px"></td>
                <td><input class="input cart-edit" data-idx="${idx}" data-field="salePrice" type="number" step="0.01" value="${it.salePrice}" style="width:100px"></td>
                <td><input class="input cart-edit" data-idx="${idx}" data-field="discount" type="number" step="0.01" value="${it.discount}" style="width:82px"></td>
                <td><input class="input cart-edit" data-idx="${idx}" data-field="tax" type="number" step="0.01" value="${it.tax}" style="width:82px"></td>
                <td>${money(Number(it.qty)*Number(it.salePrice) * (1 - Number(it.discount||0)/100) * (1 + Number(it.tax||0)/100))}</td>
                <td><button class="btn" data-remove="${idx}">X</button></td>
              </tr>`).join('') || '<tr><td colspan="7" class="muted">Cart is empty</td></tr>'}
            </tbody></table>
          </div>
          <div class="invoice-box" style="margin-top:12px">
            <div class="cols-2">
              <div><div class="muted">Total items</div><div style="font-size:22px;font-weight:800">${state.cart.length}</div></div>
              <div><div class="muted">Grand total</div><div style="font-size:22px;font-weight:800">${money(cartTotal)}</div></div>
            </div>
            <div class="form-grid" style="margin-top:12px">
              <div class="span2"><label class="muted">Payment Method</label><select id="paymentMethod" class="input"><option>Cash</option><option>Card</option><option>QR</option><option>Mixed</option></select></div>
              <div class="span2"><label class="muted">Invoice Notes</label><input id="saleNotes" class="input" placeholder="Notes"></div>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn" id="btnClearCart">Clear</button>
            <button class="btn btn-primary" data-pay>Save Invoice</button>
          </div>
          <div class="footnote">Shortcuts: <span class="kbd">F1</span> search, <span class="kbd">F3</span> hold, <span class="kbd">F4</span> payment, <span class="kbd">Ctrl+P</span> print.</div>
        </div>
      </div>
    `);
  }

  async function renderProducts(){
    const cats = state.data.categories.filter(x=>x.active!==false);
    const brands = state.data.brands;
    const units = state.data.units;
    const rows = state.data.products;
    const filters = state.filters.products || {};
    const filtered = filterRecords(rows, filters);
    const selected = state.selectedProductId ? productById(state.selectedProductId) : filtered[0];
    return screenShell('Product Management', 'Create products, assign categories/brands/units, and track stock stats.', `
      <div class="split">
        <div class="panel">
          <div class="toolbar">
            <button class="btn btn-primary" id="btnNewProduct">New Product</button>
            <input class="input table-filter-global" placeholder="Search products..." value="${escapeHtml(filters.q||'')}" style="max-width:220px">
            <div class="spacer"></div>
            <button class="btn" id="btnExportProducts">Export CSV</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><input class="input table-filter" data-store="products" data-key="name" placeholder="Product" value="${escapeHtml(filters.name||'')}"></th>
                  <th><input class="input table-filter" data-store="products" data-key="barcode" placeholder="Barcode" value="${escapeHtml(filters.barcode||'')}"></th>
                  <th><input class="input table-filter" data-store="products" data-key="sku" placeholder="SKU" value="${escapeHtml(filters.sku||'')}"></th>
                  <th><input class="input table-filter" data-store="products" data-key="categoryId" placeholder="Category" value="${escapeHtml(filters.categoryId||'')}"></th>
                  <th><input class="input table-filter" data-store="products" data-key="brandId" placeholder="Brand" value="${escapeHtml(filters.brandId||'')}"></th>
                  <th><input class="input table-filter" data-store="products" data-key="qty" placeholder="Qty" value="${escapeHtml(filters.qty||'')}"></th>
                  <th>Stats</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(p=>{ const st=calcProductStats(p.id); return `<tr data-id="${p.id}" class="${state.selectedProductId===p.id?'selected':''}">
                  <td>${escapeHtml(p.name)}</td>
                  <td>${escapeHtml(p.barcode||'')}</td>
                  <td>${escapeHtml(p.sku||'')}</td>
                  <td>${escapeHtml(categoryById(p.categoryId)?.name || '')}</td>
                  <td>${escapeHtml(brandById(p.brandId)?.name || '')}</td>
                  <td>${fmt(p.qty||0)}</td>
                  <td>${badgeStock(st.current,p.threshold||0)}</td>
                  <td><button class="btn" data-edit-product="${p.id}">Edit</button> <button class="btn" data-del-product="${p.id}">Del</button></td>
                </tr>`}).join('') || '<tr><td colspan="8" class="muted">No products found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Product Detail & Inventory Visibility</div>
          ${selected ? (()=>{ const st=calcProductStats(selected.id); return `
            <div class="item-card">
              <div style="font-size:18px;font-weight:800">${escapeHtml(selected.name)}</div>
              <div class="muted">Barcode: ${escapeHtml(selected.barcode||'-')} | SKU: ${escapeHtml(selected.sku||'-')}</div>
              <div class="muted">Category: ${escapeHtml(categoryById(selected.categoryId)?.name || '-')}</div>
              <div class="muted">Brand: ${escapeHtml(brandById(selected.brandId)?.name || '-')}</div>
              <div class="muted">Unit: ${escapeHtml(unitById(selected.unitId)?.name || '-')}</div>
              <div class="cols-2" style="margin-top:12px">
                <div class="item-card">Current <strong>${fmt(st.current)}</strong></div>
                <div class="item-card">Sold <strong>${fmt(st.sold)}</strong></div>
                <div class="item-card">Purchased <strong>${fmt(st.purchased)}</strong></div>
                <div class="item-card">Returned <strong>${fmt(st.returned)}</strong></div>
                <div class="item-card">Reserved <strong>${fmt(st.reserved)}</strong></div>
                <div class="item-card">Threshold <strong>${fmt(selected.threshold||0)}</strong></div>
              </div>
              <div style="margin-top:12px">${badgeStock(st.current, selected.threshold||0)}</div>
              <div class="form-actions">
                <button class="btn" data-edit-product="${selected.id}">Edit</button>
                <button class="btn btn-primary" data-send-to-pos="${selected.id}">Send to POS</button>
              </div>
            </div>`; })() : '<div class="muted">Select a product</div>'}
        </div>
      </div>
    `);
  }

  async function renderCrud(store){
    const rows = state.data[store];
    const filters = state.filters[store] || {};
    const list = filterRecords(rows, filters);
    const cfg = {
      categories:{ title:'Category Management', hint:'Create categories before assigning to products.', cols:['name','parentId','icon','active']},
      brands:{ title:'Brand Management', hint:'Create brands before assigning to products.', cols:['name','notes']},
      units:{ title:'Unit Management', hint:'Units dynamically populate in product forms.', cols:['name','short']},
      suppliers:{ title:'Supplier Management', hint:'Supplier CRUD with purchase history access.', cols:['name','phone','email','balance']},
      customers:{ title:'Customer Management', hint:'Khata accounts, balances, and history.', cols:['name','phone','email','balance']},
    }[store];
    return screenShell(cfg.title, cfg.hint, `
      <div class="panel">
        <div class="toolbar">
          <button class="btn btn-primary" data-new="${store}">Add New</button>
          <input class="input table-filter-global" placeholder="Search in ${cfg.title}" value="${escapeHtml(filters.q||'')}" style="max-width:240px">
          <div class="spacer"></div>
          <button class="btn" data-export="${store}">Export CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>${cfg.cols.map(c=>`<th><input class="input table-filter" data-store="${store}" data-key="${c}" placeholder="${c}" value="${escapeHtml(filters[c]||'')}"></th>`).join('')}<th>Actions</th></tr></thead>
            <tbody>
              ${list.map(r=>`<tr data-row="${store}:${r.id}">
                ${cfg.cols.map(c=>`<td>${escapeHtml(formatCrudCell(store,c,r[c]))}</td>`).join('')}
                <td><button class="btn" data-edit="${store}:${r.id}">Edit</button> <button class="btn" data-delete="${store}:${r.id}">Del</button></td>
              </tr>`).join('') || '<tr><td colspan="10" class="muted">No records</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `);
  }

  function formatCrudCell(store, field, val){
    if(store==='categories' && field==='parentId') return categoryById(val)?.name || '-';
    if(store==='products'){
      if(field==='categoryId') return categoryById(val)?.name || '-';
      if(field==='brandId') return brandById(val)?.name || '-';
      if(field==='unitId') return unitById(val)?.name || '-';
    }
    return val ?? '';
  }

  async function renderInventory(){
    const rows = state.data.products.map(p=>({...p, stats: calcProductStats(p.id)}));
    return screenShell('Inventory Management', 'Current stock, movement, and visibility across all product activities.', `
      <div class="panel">
        <div class="toolbar">
          <button class="btn" id="btnStockAdjust">Adjust Stock</button>
          <input class="search" id="inventorySearch" placeholder="Search inventory..." style="max-width:260px">
          <div class="spacer"></div>
          <span class="badge">All products display current, sold, purchased, returned, reserved</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Current</th><th>Sold</th><th>Purchased</th><th>Returned</th><th>Reserved</th><th>Threshold</th><th>Status</th></tr></thead>
            <tbody id="inventoryBody">
              ${rows.map(p=>`<tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${fmt(p.stats.current)}</td>
                <td>${fmt(p.stats.sold)}</td>
                <td>${fmt(p.stats.purchased)}</td>
                <td>${fmt(p.stats.returned)}</td>
                <td>${fmt(p.stats.reserved)}</td>
                <td>${fmt(p.threshold||0)}</td>
                <td>${badgeStock(p.stats.current, p.threshold||0)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `);
  }

  async function renderLowStock(){
    const list = state.data.products.filter(p=>Number(p.qty||0) <= Number(p.threshold||0));
    return screenShell('Low Stock', 'Dedicated low stock view with direct access to inventory warnings.', `
      <div class="panel">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Current</th><th>Threshold</th><th>Last Sale</th><th>Warehouse</th><th>Status</th></tr></thead>
            <tbody>${list.map(p=>`<tr><td>${escapeHtml(p.name)}</td><td>${fmt(p.qty||0)}</td><td>${fmt(p.threshold||0)}</td><td>${getLastSaleDate(p.id)}</td><td>${escapeHtml(p.warehouse||'Main')}</td><td>${badgeStock(p.qty||0,p.threshold||0)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No low stock items</td></tr>'}</tbody>
        </table></div></div>
    `);
  }

  function getLastSaleDate(pid){
    const items = state.data.salesInvoices.filter(inv=>inv.items?.some(i=>i.productId===pid)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return items[0]?.date || '-';
  }

  async function renderNegativeStock(){
    const list = state.data.products.filter(p=>Number(p.qty||0) < 0);
    return screenShell('Negative Stock', 'Negative stock is allowed and tracked without crashing the system.', `
      <div class="panel">
        <div class="table-wrap">
          <table><thead><tr><th>Product</th><th>Current</th><th>Purchased</th><th>Sold</th><th>Returned</th><th>Status</th></tr></thead>
          <tbody>${list.map(p=>{ const st=calcProductStats(p.id); return `<tr><td>${escapeHtml(p.name)}</td><td>${fmt(st.current)}</td><td>${fmt(st.purchased)}</td><td>${fmt(st.sold)}</td><td>${fmt(st.returned)}</td><td>${badgeStock(st.current,p.threshold||0)}</td></tr>`}).join('') || '<tr><td colspan="6" class="muted">No negative stock items</td></tr>'}</tbody>
        </table></div></div>
    `);
  }

  async function renderPurchase(){
    const suppliers = state.data.suppliers.filter(x=>x.active!==false);
    const products = state.data.products.filter(x=>x.status!=='inactive');
    const body = `
      <div class="split">
        <div class="panel">
          <div class="section-title">Create Purchase / GRN</div>
          <div class="form-grid">
            <div class="span2"><label class="muted">Supplier</label><select id="purchaseSupplier" class="input">${suppliers.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></div>
            <div><label class="muted">GRN No</label><input id="purchaseNo" class="input" value="${'GRN-' + Date.now()}"></div>
            <div><label class="muted">Date</label><input id="purchaseDate" class="input" type="date" value="${todayISO()}"></div>
            <div class="span4"><label class="muted">Add Item</label>
              <div class="cols-3">
                <select id="purchaseProduct" class="input">${products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
                <input id="purchaseQty" class="input" type="number" value="1" min="0" step="1" placeholder="Qty">
                <input id="purchaseCost" class="input" type="number" value="0" min="0" step="0.01" placeholder="Cost">
              </div>
            </div>
            <div class="span4"><button class="btn" id="btnAddPurchaseLine">Add Line</button></div>
          </div>
          <div class="table-wrap" style="margin-top:12px">
            <table style="min-width:0"><thead><tr><th>Product</th><th>Qty</th><th>Cost</th><th>Total</th><th></th></tr></thead>
            <tbody id="purchaseLines">
              ${(state.pendingImport?.lines||[]).map((l,idx)=>`<tr><td>${escapeHtml(productById(l.productId)?.name||'')}</td><td>${fmt(l.qty)}</td><td>${money(l.cost)}</td><td>${money(l.qty*l.cost)}</td><td><button class="btn" data-remove-purchase-line="${idx}">X</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No purchase lines</td></tr>'}
            </tbody></table>
          </div>
          <div class="form-actions">
            <button class="btn" id="btnClearPurchase">Clear</button>
            <button class="btn btn-primary" id="btnSavePurchase">Save GRN / Purchase Invoice</button>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Purchase History</div>
          <div class="table-wrap">
            <table><thead><tr><th>No</th><th>Date</th><th>Supplier</th><th>Total</th><th>Items</th></tr></thead>
              <tbody>${[...state.data.purchaseInvoices].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,12).map(p=>`<tr><td>${escapeHtml(p.invoiceNo)}</td><td>${escapeHtml(p.date)}</td><td>${escapeHtml(supplierById(p.supplierId)?.name||'')}</td><td>${money(p.total)}</td><td>${p.items.length}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No purchases</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    return screenShell('Purchase / GRN', 'On save, purchase invoice is created and stock is updated.', body);
  }

  async function renderReturns(){
    const sales = [...state.data.salesInvoices].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const purchases = [...state.data.purchaseInvoices].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return screenShell('Returns Management', 'Customer returns add stock back; supplier returns deduct stock.', `
      <div class="cols-2">
        <div class="panel">
          <div class="section-title">Customer Returns</div>
          <div class="form-grid">
            <div class="span2"><label class="muted">Sale Invoice</label><select id="returnSaleInvoice" class="input">${sales.map(s=>`<option value="${s.id}">${escapeHtml(s.invoiceNo)} - ${escapeHtml(s.customerName||'Walk-in')}</option>`).join('')}</select></div>
            <div><label class="muted">Return Qty</label><input id="returnQty" class="input" type="number" value="1"></div>
            <div><label class="muted">Reason</label><input id="returnReason" class="input" placeholder="Damaged / Exchange / Refund"></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" id="btnCustomerReturn">Create Customer Return</button></div>
        </div>
        <div class="panel">
          <div class="section-title">Supplier Returns</div>
          <div class="form-grid">
            <div class="span2"><label class="muted">Purchase Invoice</label><select id="returnPurchaseInvoice" class="input">${purchases.map(s=>`<option value="${s.id}">${escapeHtml(s.invoiceNo)} - ${escapeHtml(s.supplierName||'')}</option>`).join('')}</select></div>
            <div><label class="muted">Return Qty</label><input id="returnQty2" class="input" type="number" value="1"></div>
            <div><label class="muted">Reason</label><input id="returnReason2" class="input" placeholder="Short / Defect / Return"></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" id="btnSupplierReturn">Create Supplier Return</button></div>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="section-title">Return History</div>
        <div class="table-wrap">
          <table><thead><tr><th>No</th><th>Type</th><th>Date</th><th>Reference</th><th>Product</th><th>Qty</th><th>Reason</th></tr></thead>
          <tbody>${[...state.data.returns].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>`<tr><td>${escapeHtml(r.no)}</td><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.referenceNo)}</td><td>${escapeHtml(productById(r.productId)?.name||'')}</td><td>${fmt(r.qty)}</td><td>${escapeHtml(r.reason||'')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No returns</td></tr>'}</tbody>
        </table></div>
      </div>
    `);
  }

  async function renderReports(){
    const sales = state.data.salesInvoices;
    const purchases = state.data.purchaseInvoices;
    const rows = [
      ['Sales Reports', sales.length, money(sales.reduce((a,b)=>a+Number(b.total||0),0))],
      ['Purchase Reports', purchases.length, money(purchases.reduce((a,b)=>a+Number(b.total||0),0))],
      ['GRN Reports', purchases.length, money(purchases.reduce((a,b)=>a+Number(b.total||0),0))],
      ['Inventory Reports', state.data.products.length, '-'],
      ['Low Stock Reports', state.data.products.filter(p=>p.qty<=p.threshold).length, '-'],
      ['Negative Stock Reports', state.data.products.filter(p=>p.qty<0).length, '-'],
      ['Customer Reports', state.data.customers.length, '-'],
      ['Supplier Reports', state.data.suppliers.length, '-'],
      ['Return Reports', state.data.returns.length, '-'],
      ['Profit/Loss Reports', 1, money(sales.reduce((a,b)=>a+Number(b.total||0),0) - purchases.reduce((a,b)=>a+Number(b.totalCost||0),0))],
      ['Expense Reports', 0, '-'],
      ['Ledger Reports', 0, '-'],
      ['Tax Reports', 0, '-'],
      ['Daily Reports', 1, '-'],
      ['Monthly Reports', 1, '-'],
      ['Yearly Reports', 1, '-'],
      ['Custom Date Reports', 1, '-'],
      ['Product Movement Reports', state.data.inventoryMovements.length, '-'],
      ['Cost Reports', state.data.products.length, '-'],
      ['Top Product Reports', 5, '-'],
      ['Slow Product Reports', 5, '-']
    ];
    return screenShell('Reports', 'Separate report windows are represented as dedicated modules with export/print options.', `
      <div class="panel">
        <div class="toolbar">
          <button class="btn" id="btnReportCSV">Export Summary CSV</button>
          <button class="btn" id="btnPrintReport">Print Preview</button>
        </div>
        <div class="table-wrap">
          <table style="min-width:0"><thead><tr><th>Report</th><th>Count</th><th>Value</th></tr></thead>
          <tbody>${rows.map(r=>`<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td><td>${escapeHtml(r[2])}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>
    `);
  }

  async function renderUsers(){
    const rows = state.data.users;
    return screenShell('User Management', 'Basic multi-user roles and permissions with a Super Admin fallback.', `
      <div class="split">
        <div class="panel">
          <div class="section-title">Users</div>
          <div class="table-wrap">
            <table style="min-width:0"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Active</th><th>Actions</th></tr></thead>
              <tbody>${rows.map(u=>`<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.role)}</td><td>${u.active!==false?'Yes':'No'}</td><td><button class="btn" data-edit-user="${u.id}">Edit</button> <button class="btn" data-delete-user="${u.id}">Del</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No users</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Permissions</div>
          <div class="muted">Super Admin has full access. Other users can be assigned feature-based permissions.</div>
          <div class="grid" style="gap:8px; margin-top:12px">
            <div class="item-card">Open POS</div>
            <div class="item-card">Apply Discount</div>
            <div class="item-card">Delete Invoice</div>
            <div class="item-card">View Reports</div>
            <div class="item-card">Edit Settings</div>
            <div class="item-card">Create User</div>
          </div>
        </div>
      </div>
      <div class="panel" style="margin-top:14px">
        <button class="btn btn-primary" id="btnNewUser">Add User</button>
      </div>
    `);
  }

  async function renderSettings(){
    const company = (await getSetting('company'))?.value || {};
    const lic = (await getSetting('license'))?.value || {};
    const printer = (await getSetting('printer'))?.value || {};
    const dbmode = (await getSetting('dbmode'))?.value || {};
    return screenShell('Settings', 'Company, license, printer, database mode, and activation controls.', `
      <div class="cols-2">
        <div class="panel">
          <div class="section-title">Company Settings</div>
          <div class="form-grid">
            <div class="span2"><label class="muted">Company Name</label><input id="companyName" class="input" value="${escapeHtml(company.name||'')}"></div>
            <div class="span2"><label class="muted">Address</label><input id="companyAddress" class="input" value="${escapeHtml(company.address||'')}"></div>
            <div><label class="muted">Phone</label><input id="companyPhone" class="input" value="${escapeHtml(company.phone||'')}"></div>
            <div><label class="muted">Email</label><input id="companyEmail" class="input" value="${escapeHtml(company.email||'')}"></div>
            <div><label class="muted">Website</label><input id="companyWebsite" class="input" value="${escapeHtml(company.website||'')}"></div>
            <div><label class="muted">Footer</label><input id="companyFooter" class="input" value="${escapeHtml(company.footer||'')}"></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" id="btnSaveCompany">Save Company</button></div>
        </div>
        <div class="panel">
          <div class="section-title">License / Trial</div>
          <div class="form-grid">
            <div><label class="muted">Activated</label><select id="licActivated" class="input"><option value="false" ${!lic.activated?'selected':''}>No</option><option value="true" ${lic.activated?'selected':''}>Yes</option></select></div>
            <div><label class="muted">Type</label><select id="licType" class="input"><option value="trial-7">7-day trial</option><option value="trial-30">30-day trial</option><option value="custom">Custom date trial</option><option value="permanent">Permanent activation</option></select></div>
            <div><label class="muted">Start</label><input id="licStart" type="date" class="input" value="${escapeHtml(lic.startedAt || todayISO())}"></div>
            <div><label class="muted">End</label><input id="licEnd" type="date" class="input" value="${escapeHtml(lic.endsAt || addDays(todayISO(), 30))}"></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" id="btnSaveLicense">Save License</button></div>
          <div class="footnote">If expired and not activated, only Super Admin can use the system.</div>
        </div>
      </div>
      <div class="cols-2" style="margin-top:14px">
        <div class="panel">
          <div class="section-title">Printer Settings</div>
          <div class="form-grid">
            <div><label class="muted">Thermal</label><select id="printerThermal" class="input"><option ${printer.thermal==='ESC/POS'?'selected':''}>ESC/POS</option><option ${printer.thermal==='Better'?'selected':''}>Better</option></select></div>
            <div><label class="muted">Report</label><select id="printerReport" class="input"><option ${printer.report==='A4'?'selected':''}>A4</option><option ${printer.report==='Thermal'?'selected':''}>Thermal</option></select></div>
            <div><label class="muted">Auto Cut</label><select id="printerCut" class="input"><option value="true" ${printer.autoCut!==false?'selected':''}>Yes</option><option value="false" ${printer.autoCut===false?'selected':''}>No</option></select></div>
            <div><label class="muted">Cash Drawer</label><select id="printerDrawer" class="input"><option value="true">Yes</option><option value="false">No</option></select></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" id="btnSavePrinter">Save Printer</button></div>
        </div>
        <div class="panel">
          <div class="section-title">Database Mode</div>
          <div class="form-grid">
            <div class="span2"><label class="muted">Mode</label><select id="dbMode" class="input"><option value="sqlite-local" ${dbmode.mode==='sqlite-local'?'selected':''}>SQLite / Local</option><option value="mysql-server" ${dbmode.mode==='mysql-server'?'selected':''}>MySQL Server</option><option value="api" ${dbmode.mode==='api'?'selected':''}>API / Cloud</option></select></div>
            <div class="span2"><label class="muted">Note</label><input class="input" value="Front-end demo uses IndexedDB" readonly></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" id="btnSaveDbMode">Save DB Mode</button></div>
        </div>
      </div>
    `);
  }

  async function renderAudit(){
    const rows = [...state.data.auditLogs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return screenShell('Audit Logs', 'Searchable logs for login, stock, invoice, settings, backup, and permissions.', `
      <div class="panel">
        <div class="toolbar">
          <input id="auditSearch" class="search" placeholder="Search logs..." style="max-width:260px">
        </div>
        <div class="table-wrap">
          <table style="min-width:0"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
            <tbody id="auditBody">${rows.map(r=>`<tr><td>${escapeHtml(r.createdAt)}</td><td>${escapeHtml(r.user)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.details)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No logs</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `);
  }

  async function renderBackup(){
    return screenShell('Backup & Recovery', 'Manual export/import backup with restore flow.', `
      <div class="cols-2">
        <div class="panel">
          <div class="section-title">Backup</div>
          <div class="muted">Export full database as JSON.</div>
          <div class="form-actions">
            <button class="btn btn-primary" id="btnExportBackup">Download Backup</button>
            <button class="btn" id="btnAutoBackup">Auto Backup</button>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Restore</div>
          <input type="file" id="restoreFile" class="input" accept=".json">
          <div class="form-actions">
            <button class="btn btn-primary" id="btnRestoreBackup">Restore Selected Backup</button>
          </div>
        </div>
      </div>
    `);
  }

  async function renderCredits(){
    return screenShell('Credits', 'Protected internal branding and version details.', `
      <div class="panel">
        <div class="cols-3">
          <div class="item-card"><div class="muted">Developer</div><div style="font-weight:800">MetaMind Tech Team</div></div>
          <div class="item-card"><div class="muted">Owner</div><div style="font-weight:800">Company Owner</div></div>
          <div class="item-card"><div class="muted">Version</div><div style="font-weight:800">1.0.0</div></div>
        </div>
      </div>
    `);
  }

  function wireScreen(){
    const screen = $('#screen');
    if(state.screen==='pos') wirePOS(screen);
    if(state.screen==='products') wireProducts(screen);
    if(['categories','brands','units','suppliers','customers'].includes(state.screen)) wireCrud(screen, state.screen);
    if(state.screen==='inventory') wireInventory(screen);
    if(state.screen==='purchase') wirePurchase(screen);
    if(state.screen==='returns') wireReturns(screen);
    if(state.screen==='reports') wireReports(screen);
    if(state.screen==='users') wireUsers(screen);
    if(state.screen==='settings') wireSettings(screen);
    if(state.screen==='audit') wireAudit(screen);
    if(state.screen==='backup') wireBackup(screen);
  }

  function wirePOS(screen){
    $('#posProductSearch').oninput = (e)=>{ state.filters.posSearch = e.target.value; renderScreen(); };
    $('#posCustomer').value = state.cart.customerId || state.data.customers[0]?.id || '';
    $('#posCustomer').onchange = e=> state.cart.customerId = e.target.value;
    $('#btnClearCart').onclick = ()=>{ state.cart = []; renderScreen(); };
    $$('[data-add-product]').forEach(btn=>btn.onclick = ()=>addToCart(btn.dataset.addProduct));
    $$('[data-remove]').forEach(btn=>btn.onclick = ()=>{ state.cart.splice(Number(btn.dataset.remove),1); renderScreen(); });
    $$('.cart-edit').forEach(inp=>inp.oninput = (e)=>{ const i=Number(e.target.dataset.idx); const f=e.target.dataset.field; state.cart[i][f]=e.target.value; renderScreen(); });
    $$('[data-pay]').forEach(btn=>btn.onclick = ()=>saveSale());
    $$('[data-hold]').forEach(btn=>btn.onclick = ()=>holdSale());
    $$('[data-send-to-pos]').forEach(btn=>btn.onclick = ()=>{ addToCart(btn.dataset.sendToPos); go('pos'); });
  }

  function wireProducts(screen){
    $('#btnNewProduct').onclick = ()=>openProductModal();
    $('#btnExportProducts').onclick = ()=>exportCSV(state.data.products, 'products.csv');
    $('.table-filter-global').oninput = (e)=>{ state.filters.products = state.filters.products || {}; state.filters.products.q = e.target.value; state.filters.products.name = e.target.value; renderScreen(); };
    $$('.table-filter').forEach(inp=>inp.oninput = (e)=>{ const store=e.target.dataset.store; state.filters[store]=state.filters[store]||{}; state.filters[store][e.target.dataset.key]=e.target.value; renderScreen(); });
    $$('[data-edit-product]').forEach(btn=>btn.onclick = ()=>openProductModal(btn.dataset.editProduct));
    $$('[data-del-product]').forEach(btn=>btn.onclick = ()=>deleteRecord('products', btn.dataset.delProduct));
    $$('[data-send-to-pos]').forEach(btn=>btn.onclick = ()=>{ addToCart(btn.dataset.sendToPos); go('pos'); });
    $$('.selected').forEach(row=>row.onclick=()=>{ state.selectedProductId = row.dataset.id; renderScreen(); });
    $$('tr[data-id]').forEach(row=>row.onclick=()=>{ state.selectedProductId = row.dataset.id; renderScreen(); });
  }

  function wireCrud(screen, store){
    $$('[data-new]').forEach(btn=>btn.onclick = ()=>openCrudModal(store));
    $$('.table-filter-global').oninput = (e)=>{ state.filters[store]=state.filters[store]||{}; state.filters[store].q = e.target.value; renderScreen(); };
    $$('.table-filter').forEach(inp=>inp.oninput = (e)=>{ state.filters[store]=state.filters[store]||{}; state.filters[store][e.target.dataset.key]=e.target.value; renderScreen(); });
    $$('[data-edit]').forEach(btn=>btn.onclick = ()=>{ const [st,id] = btn.dataset.edit.split(':'); openCrudModal(st,id); });
    $$('[data-delete]').forEach(btn=>btn.onclick = ()=>{ const [st,id] = btn.dataset.delete.split(':'); deleteRecord(st,id); });
    $$('[data-export]').forEach(btn=>btn.onclick = ()=>exportCSV(state.data[store], `${store}.csv`));
  }

  function wireInventory(screen){
    $('#inventorySearch').oninput = (e)=>{
      const q=e.target.value.toLowerCase();
      $$('#inventoryBody tr').forEach(tr=>{ tr.style.display = tr.innerText.toLowerCase().includes(q)?'':'none'; });
    };
    $('#btnStockAdjust').onclick = ()=>openStockAdjustModal();
  }

  function wirePurchase(screen){
    $('#btnAddPurchaseLine').onclick = ()=>{
      const productId = $('#purchaseProduct').value;
      const qty = Number($('#purchaseQty').value||0);
      const cost = Number($('#purchaseCost').value||0);
      state.pendingImport = state.pendingImport || { lines: [] };
      state.pendingImport.lines.push({ productId, qty, cost });
      renderScreen();
    };
    $('#btnClearPurchase').onclick = ()=>{ state.pendingImport = { lines: [] }; renderScreen(); };
    $('#btnSavePurchase').onclick = ()=>savePurchase();
    $$('[data-remove-purchase-line]').forEach(btn=>btn.onclick = ()=>{ state.pendingImport.lines.splice(Number(btn.dataset.removePurchaseLine),1); renderScreen(); });
  }

  function wireReturns(screen){
    $('#btnCustomerReturn').onclick = ()=>saveCustomerReturn();
    $('#btnSupplierReturn').onclick = ()=>saveSupplierReturn();
  }

  function wireReports(screen){
    $('#btnReportCSV').onclick = ()=>exportCSV(reportSummary(), 'report-summary.csv');
    $('#btnPrintReport').onclick = ()=>window.print();
  }

  function wireUsers(screen){
    $('#btnNewUser').onclick = ()=>openUserModal();
    $$('[data-edit-user]').forEach(btn=>btn.onclick = ()=>openUserModal(btn.dataset.editUser));
    $$('[data-delete-user]').forEach(btn=>btn.onclick = ()=>deleteRecord('users', btn.dataset.deleteUser));
  }

  function wireSettings(screen){
    $('#btnSaveCompany').onclick = ()=>saveCompany();
    $('#btnSaveLicense').onclick = ()=>saveLicense();
    $('#btnSavePrinter').onclick = ()=>savePrinter();
    $('#btnSaveDbMode').onclick = ()=>saveDbMode();
  }

  function wireAudit(screen){
    $('#auditSearch').oninput = (e)=>{
      const q=e.target.value.toLowerCase();
      $$('#auditBody tr').forEach(tr=>{ tr.style.display = tr.innerText.toLowerCase().includes(q)?'':'none'; });
    };
  }

  function wireBackup(screen){
    $('#btnExportBackup').onclick = ()=>backupNow();
    $('#btnAutoBackup').onclick = ()=>backupNow(true);
    $('#btnRestoreBackup').onclick = ()=>restoreBackup();
  }

  async function addToCart(pid){
    const p = productById(pid);
    if(!p) return;
    const existing = state.cart.find(x=>x.productId===pid);
    if(existing) existing.qty = Number(existing.qty||0) + 1;
    else state.cart.push({ productId: pid, qty: 1, salePrice: Number(p.salePrice||0), discount:0, tax:0, notes:'', warehouse:'Main', batch:'', serial:'' });
    state.selectedProductId = pid;
    await renderScreen();
    showAlert(`${p.name} added to cart`, 'warn');
  }

  async function saveSale(){
    if(state.trialExpired && state.currentUser?.role!=='superadmin'){ showAlert('Trial expired. Only Super Admin can sell.', 'warn'); return; }
    if(!state.cart.length){ showAlert('Cart is empty', 'warn'); return; }
    const customerId = $('#posCustomer')?.value || state.data.customers[0]?.id || '';
    const invoiceNo = 'INV-' + Date.now();
    const date = todayISO();
    const items = state.cart.map(it=>{
      const p = productById(it.productId);
      const qty = Number(it.qty||0);
      const salePrice = Number(it.salePrice||0);
      const discount = Number(it.discount||0);
      const tax = Number(it.tax||0);
      return {
        productId: p.id, name: p.name, qty, salePrice, discount, tax,
        lineTotal: qty * salePrice * (1 - discount/100) * (1 + tax/100)
      };
    });
    const total = items.reduce((a,b)=>a+b.lineTotal,0);
    const current = await MetaDB.getAll('products');
    for(const it of items){
      const p = current.find(x=>x.id===it.productId);
      p.qty = Number(p.qty||0) - Number(it.qty||0);
      await MetaDB.put('products', p);
      await MetaDB.put('inventoryMovements', { id:MetaUtil.uid('MOV'), productId:p.id, type:'SALE', qty:Number(it.qty), refNo:invoiceNo, date, createdAt:MetaUtil.nowISO(), note:'POS sale' });
    }
    const cust = customerById(customerId);
    const sale = { id:MetaUtil.uid('INV'), invoiceNo, date, customerId, customerName:cust?.name || 'Walk-in', items, total, paymentMethod: $('#paymentMethod')?.value || 'Cash', notes: $('#saleNotes')?.value || '', createdAt:MetaUtil.nowISO() };
    await MetaDB.put('salesInvoices', sale);
    await audit('SALE_INVOICE_CREATED', `${invoiceNo} total ${total}`);
    state.cart = [];
    state.pendingImport = null;
    await reloadAndRender('Sale saved successfully', 'good');
  }

  async function holdSale(){
    const payload = { id: MetaUtil.uid('HLD'), invoiceNo:'HOLD-'+Date.now(), items: deepClone(state.cart), createdAt: MetaUtil.nowISO() };
    const logs = await MetaDB.getAll('backups');
    logs.unshift({ id:payload.id, type:'held-sale', payload });
    await MetaDB.put('backups', logs[0]); // store a single quick-save
    showAlert('Sale held locally', 'warn');
  }

  async function savePurchase(){
    if(!state.pendingImport || !state.pendingImport.lines?.length){ showAlert('No purchase lines', 'warn'); return; }
    const supplierId = $('#purchaseSupplier').value;
    const invoiceNo = $('#purchaseNo').value || ('GRN-' + Date.now());
    const date = $('#purchaseDate').value || todayISO();
    const items = state.pendingImport.lines.map(l=>{
      const p = productById(l.productId);
      return { productId:p.id, name:p.name, qty:Number(l.qty||0), cost:Number(l.cost||0), lineTotal:Number(l.qty||0) * Number(l.cost||0) };
    });
    const total = items.reduce((a,b)=>a+b.lineTotal,0);
    const prods = await MetaDB.getAll('products');
    for(const it of items){
      const p = prods.find(x=>x.id===it.productId);
      p.qty = Number(p.qty||0) + Number(it.qty||0);
      p.costPrice = Number(it.cost);
      await MetaDB.put('products', p);
      await MetaDB.put('inventoryMovements', { id:MetaUtil.uid('MOV'), productId:p.id, type:'PURCHASE', qty:Number(it.qty), refNo:invoiceNo, date, createdAt:MetaUtil.nowISO(), note:'GRN purchase' });
    }
    const supp = supplierById(supplierId);
    await MetaDB.put('purchaseInvoices', { id:MetaUtil.uid('PUR'), invoiceNo, date, supplierId, supplierName:supp?.name || '', items, total, totalCost: total, createdAt:MetaUtil.nowISO() });
    await audit('PURCHASE_INVOICE_CREATED', `${invoiceNo} total ${total}`);
    state.pendingImport = { lines: [] };
    await reloadAndRender('Purchase invoice saved', 'good');
  }

  async function saveCustomerReturn(){
    const inv = state.data.salesInvoices.find(x=>x.id===$('#returnSaleInvoice').value);
    if(!inv){ showAlert('Select a sale invoice', 'warn'); return; }
    const qty = Number($('#returnQty').value||0);
    const reason = $('#returnReason').value || '';
    const item = inv.items[0];
    const p = await MetaDB.get('products', item.productId);
    p.qty = Number(p.qty||0) + qty;
    await MetaDB.put('products', p);
    const ret = { id: MetaUtil.uid('RET'), no:'CRT-'+Date.now(), type:'Customer Return', date:todayISO(), referenceNo:inv.invoiceNo, productId:p.id, qty, reason, createdAt:MetaUtil.nowISO() };
    await MetaDB.put('returns', ret);
    await MetaDB.put('inventoryMovements', { id:MetaUtil.uid('MOV'), productId:p.id, type:'RETURN_IN', qty, refNo:ret.no, date:ret.date, createdAt:MetaUtil.nowISO(), note:reason });
    await audit('CUSTOMER_RETURN', `${ret.no} on ${inv.invoiceNo}`);
    await reloadAndRender('Customer return saved', 'good');
  }

  async function saveSupplierReturn(){
    const inv = state.data.purchaseInvoices.find(x=>x.id===$('#returnPurchaseInvoice').value);
    if(!inv){ showAlert('Select a purchase invoice', 'warn'); return; }
    const qty = Number($('#returnQty2').value||0);
    const reason = $('#returnReason2').value || '';
    const item = inv.items[0];
    const p = await MetaDB.get('products', item.productId);
    p.qty = Number(p.qty||0) - qty;
    await MetaDB.put('products', p);
    const ret = { id: MetaUtil.uid('RET'), no:'SRT-'+Date.now(), type:'Supplier Return', date:todayISO(), referenceNo:inv.invoiceNo, productId:p.id, qty, reason, createdAt:MetaUtil.nowISO() };
    await MetaDB.put('returns', ret);
    await MetaDB.put('inventoryMovements', { id:MetaUtil.uid('MOV'), productId:p.id, type:'RETURN_OUT', qty, refNo:ret.no, date:ret.date, createdAt:MetaUtil.nowISO(), note:reason });
    await audit('SUPPLIER_RETURN', `${ret.no} on ${inv.invoiceNo}`);
    await reloadAndRender('Supplier return saved', 'good');
  }

  async function reloadAndRender(msg, type='warn'){
    await loadAll();
    renderScreen();
    showAlert(msg, type);
  }

  async function deleteRecord(store,id){
    if(!confirm('Delete record?')) return;
    await MetaDB.del(store,id);
    await audit('DELETE_'+store.toUpperCase(), id);
    await reloadAndRender('Deleted', 'warn');
  }

  function openModal(html, size='small'){
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-overlay"><div class="modal ${size}">${html}</div></div>`;
    $('.modal-overlay').onclick = (e)=>{ if(e.target.classList.contains('modal-overlay')) root.innerHTML=''; };
    $('[data-close]')?.addEventListener('click', ()=> root.innerHTML='');
  }

  function closeModal(){ $('#modalRoot').innerHTML=''; }

  async function openCrudModal(store,id=null){
    const row = id ? await MetaDB.get(store,id) : null;
    const fields = {
      categories:[['name','Category Name'],['parentId','Parent Category'],['icon','Icon'],['active','Active']],
      brands:[['name','Brand Name'],['notes','Notes']],
      units:[['name','Unit Name'],['short','Short']],
      suppliers:[['name','Supplier Name'],['phone','Phone'],['email','Email'],['address','Address'],['notes','Notes'],['active','Active']],
      customers:[['name','Customer Name'],['phone','Phone'],['email','Email'],['address','Address'],['notes','Notes'],['balance','Balance'],['active','Active']],
    }[store];
    const form = fields.map(([k,l])=>{
      let val = row?.[k] ?? (k==='active' ? true : '');
      if(k==='active') return `<label class="muted">${l}</label><select class="input modal-field" data-key="${k}"><option value="true" ${val!==false?'selected':''}>Yes</option><option value="false" ${val===false?'selected':''}>No</option></select>`;
      if(store==='categories' && k==='parentId') return `<label class="muted">${l}</label><select class="input modal-field" data-key="${k}"><option value="">None</option>${state.data.categories.filter(c=>!id || c.id!==id).map(c=>`<option value="${c.id}" ${val===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select>`;
      return `<label class="muted">${l}</label><input class="input modal-field" data-key="${k}" value="${escapeHtml(val)}">`;
    }).join('');
    openModal(`
      <div class="modal-header"><div class="modal-title">${id?'Edit':'Add'} ${store.slice(0,-1)}</div><button class="close" data-close>×</button></div>
      <div class="form-grid">
        ${form}
      </div>
      <div class="form-actions">
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-primary" id="saveCrud" data-save>Save</button>
      </div>
    `);
    $('#saveCrud').onclick = async ()=>{
      const obj = row ? deepClone(row) : { id: MetaUtil.uid(store.slice(0,3).toUpperCase()) };
      $$('.modal-field').forEach(inp=>{
        let v = inp.value;
        if(inp.dataset.key==='active') v = inp.value==='true';
        if(inp.dataset.key==='balance') v = Number(v||0);
        obj[inp.dataset.key] = v;
      });
      if(store==='categories' && !obj.icon) obj.icon='📦';
      if(store==='products'){
        obj.qty = Number(obj.qty||0);
        obj.costPrice = Number(obj.costPrice||0);
        obj.salePrice = Number(obj.salePrice||0);
        obj.threshold = Number(obj.threshold||0);
      }
      await MetaDB.put(store,obj);
      await audit((row?'UPDATE_':'CREATE_')+store.toUpperCase(), obj.name || obj.id);
      closeModal();
      await reloadAndRender('Saved', 'good');
    };
  }

  async function openProductModal(id=null){
    const row = id ? await MetaDB.get('products', id) : { status:'active', qty:0, threshold:0, salePrice:0, costPrice:0 };
    openModal(`
      <div class="modal-header"><div class="modal-title">${id?'Edit':'Add'} Product</div><button class="close" data-close>×</button></div>
      <div class="form-grid">
        <div class="span2"><label class="muted">Name</label><input class="input modal-field" data-key="name" value="${escapeHtml(row.name||'')}"></div>
        <div><label class="muted">Barcode</label><input class="input modal-field" data-key="barcode" value="${escapeHtml(row.barcode||'')}"></div>
        <div><label class="muted">SKU</label><input class="input modal-field" data-key="sku" value="${escapeHtml(row.sku||'')}"></div>
        <div><label class="muted">Category</label><select class="input modal-field" data-key="categoryId">${state.data.categories.map(c=>`<option value="${c.id}" ${row.categoryId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div><label class="muted">Brand</label><select class="input modal-field" data-key="brandId">${state.data.brands.map(c=>`<option value="${c.id}" ${row.brandId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div><label class="muted">Unit</label><select class="input modal-field" data-key="unitId">${state.data.units.map(c=>`<option value="${c.id}" ${row.unitId===c.id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div><label class="muted">Cost Price</label><input class="input modal-field" data-key="costPrice" type="number" step="0.01" value="${row.costPrice||0}"></div>
        <div><label class="muted">Sale Price</label><input class="input modal-field" data-key="salePrice" type="number" step="0.01" value="${row.salePrice||0}"></div>
        <div><label class="muted">Qty</label><input class="input modal-field" data-key="qty" type="number" step="1" value="${row.qty||0}"></div>
        <div><label class="muted">Threshold</label><input class="input modal-field" data-key="threshold" type="number" step="1" value="${row.threshold||0}"></div>
        <div class="span2"><label class="muted">Notes</label><input class="input modal-field" data-key="notes" value="${escapeHtml(row.notes||'')}"></div>
        <div><label class="muted">Status</label><select class="input modal-field" data-key="status"><option value="active" ${row.status!=='inactive'?'selected':''}>Active</option><option value="inactive" ${row.status==='inactive'?'selected':''}>Inactive</option></select></div>
        <div><label class="muted">Warehouse</label><input class="input modal-field" data-key="warehouse" value="${escapeHtml(row.warehouse||'Main')}"></div>
      </div>
      <div class="form-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="saveProd" data-save>Save Product</button></div>
    `, 'modal');
    $('#saveProd').onclick = async ()=>{
      const obj = row?.id ? deepClone(row) : { id: MetaUtil.uid('PRD') };
      $$('.modal-field').forEach(inp=>{
        obj[inp.dataset.key] = inp.value;
      });
      obj.costPrice = Number(obj.costPrice||0);
      obj.salePrice = Number(obj.salePrice||0);
      obj.qty = Number(obj.qty||0);
      obj.threshold = Number(obj.threshold||0);
      await MetaDB.put('products', obj);
      await audit((row?.id?'UPDATE_PRODUCT':'CREATE_PRODUCT'), obj.name);
      closeModal();
      await reloadAndRender('Product saved', 'good');
    };
  }

  async function openUserModal(id=null){
    const row = id ? await MetaDB.get('users',id) : { role:'cashier', active:true, permissions:{} };
    openModal(`
      <div class="modal-header"><div class="modal-title">${id?'Edit':'Add'} User</div><button class="close" data-close>×</button></div>
      <div class="form-grid">
        <div><label class="muted">Username</label><input class="input modal-field" data-key="username" value="${escapeHtml(row.username||'')}"></div>
        <div><label class="muted">Name</label><input class="input modal-field" data-key="name" value="${escapeHtml(row.name||'')}"></div>
        <div><label class="muted">Password</label><input class="input modal-field" data-key="password" value="${escapeHtml(row.password||'')}"></div>
        <div><label class="muted">PIN</label><input class="input modal-field" data-key="pin" value="${escapeHtml(row.pin||'')}"></div>
        <div><label class="muted">Role</label><select class="input modal-field" data-key="role"><option ${row.role==='superadmin'?'selected':''}>superadmin</option><option ${row.role==='manager'?'selected':''}>manager</option><option ${row.role==='cashier'?'selected':''}>cashier</option></select></div>
        <div><label class="muted">Active</label><select class="input modal-field" data-key="active"><option value="true" ${row.active!==false?'selected':''}>Yes</option><option value="false" ${row.active===false?'selected':''}>No</option></select></div>
      </div>
      <div class="panel" style="margin-top:12px">
        <div class="section-title">Permissions</div>
        <div class="cols-2">
          ${['pos.open','pos.discount','pos.delete','reports.view','reports.export','settings.edit','users.create'].map(p=>`
            <label class="item-card"><input type="checkbox" class="perm" data-perm="${p}" ${row.permissions?.[p]||row.permissions?.['*']?'checked':''}> ${p}</label>`).join('')}
        </div>
      </div>
      <div class="form-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="saveUser" data-save>Save User</button></div>
    `, 'modal');
    $('#saveUser').onclick = async ()=>{
      const obj = row?.id ? deepClone(row) : { id: MetaUtil.uid('USR') };
      $$('.modal-field').forEach(inp=>{
        let v = inp.value;
        if(inp.dataset.key==='active') v = inp.value==='true';
        obj[inp.dataset.key] = v;
      });
      obj.permissions = obj.permissions || {};
      obj.permissions = {};
      $$('.perm').forEach(ch=>{ if(ch.checked) obj.permissions[ch.dataset.perm] = true; });
      await MetaDB.put('users', obj);
      await audit((row?.id?'UPDATE_USER':'CREATE_USER'), obj.username);
      closeModal();
      await reloadAndRender('User saved', 'good');
    };
  }

  async function openStockAdjustModal(){
    openModal(`
      <div class="modal-header"><div class="modal-title">Adjust Stock</div><button class="close" data-close>×</button></div>
      <div class="form-grid">
        <div class="span2"><label class="muted">Product</label><select id="adjProduct" class="input">${state.data.products.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></div>
        <div><label class="muted">Qty (+/-)</label><input id="adjQty" class="input" type="number" value="0"></div>
        <div><label class="muted">Reason</label><input id="adjReason" class="input" value="Adjustment"></div>
      </div>
      <div class="form-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="saveAdj">Save</button></div>
    `, 'small');
    $('#saveAdj').onclick = async ()=>{
      const p = await MetaDB.get('products',$('#adjProduct').value);
      const qty = Number($('#adjQty').value||0);
      p.qty = Number(p.qty||0) + qty;
      await MetaDB.put('products', p);
      await MetaDB.put('inventoryMovements', { id:MetaUtil.uid('MOV'), productId:p.id, type:'ADJUST', qty, refNo:'ADJ-'+Date.now(), date:todayISO(), createdAt:MetaUtil.nowISO(), note:$('#adjReason').value });
      await audit('STOCK_ADJUST', `${p.name}: ${qty}`);
      closeModal();
      await reloadAndRender('Stock adjusted', 'good');
    };
  }

  async function saveCompany(){
    const value = {
      name: $('#companyName').value, address: $('#companyAddress').value, phone: $('#companyPhone').value,
      email: $('#companyEmail').value, website: $('#companyWebsite').value, footer: $('#companyFooter').value
    };
    await setSetting('company', value); await audit('SETTINGS_COMPANY', value.name); showAlert('Company saved','good');
  }
  async function saveLicense(){
    const value = {
      activated: $('#licActivated').value==='true', type: $('#licType').value, startedAt: $('#licStart').value, endsAt: $('#licEnd').value, deviceLock:'', superAdminOnly:false
    };
    await setSetting('license', value); await audit('SETTINGS_LICENSE', value.type); showAlert('License saved','good');
    await checkTrial();
  }
  async function savePrinter(){
    const value = { thermal: $('#printerThermal').value, report: $('#printerReport').value, autoCut: $('#printerCut').value==='true' };
    await setSetting('printer', value); await audit('SETTINGS_PRINTER', value.thermal); showAlert('Printer saved','good');
  }
  async function saveDbMode(){
    const value = { mode: $('#dbMode').value };
    await setSetting('dbmode', value); await audit('SETTINGS_DBMODE', value.mode); showAlert('Database mode saved','good');
  }

  async function backupNow(auto=false){
    const payload = {};
    for(const s of ['settings','categories','brands','units','products','suppliers','customers','purchaseInvoices','salesInvoices','returns','users','auditLogs','inventoryMovements','license','backups']){
      payload[s] = await MetaDB.getAll(s);
    }
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `metamind-backup-${Date.now()}.json`;
    a.click();
    await audit('BACKUP_EXPORT', auto ? 'Auto backup' : 'Manual backup');
    if(!auto) showAlert('Backup downloaded', 'good');
  }

  async function restoreBackup(){
    const file = $('#restoreFile').files[0];
    if(!file){ showAlert('Choose a JSON backup file', 'warn'); return; }
    const text = await file.text();
    const payload = JSON.parse(text);
    for(const s of Object.keys(payload)){
      await MetaDB.clear(s);
      await MetaDB.bulkPut(s, payload[s]);
    }
    await audit('BACKUP_RESTORE', file.name);
    await reloadAndRender('Backup restored', 'good');
  }

  function exportCSV(rows, filename){
    if(!rows || !rows.length){ showAlert('Nothing to export', 'warn'); return; }
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(rows.map(r=>headers.map(h=>`"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(','))).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }
  function reportSummary(){
    return [
      { report:'Sales Reports', count: state.data.salesInvoices.length, value: state.data.salesInvoices.reduce((a,b)=>a+Number(b.total||0),0) },
      { report:'Purchase Reports', count: state.data.purchaseInvoices.length, value: state.data.purchaseInvoices.reduce((a,b)=>a+Number(b.total||0),0) },
      { report:'Returns Reports', count: state.data.returns.length, value: 0 },
    ];
  }

  // initial data + resume state
  (async()=>{
    await seed();
    await loadAll();
    const lic = (await getSetting('license'))?.value || {};
    state.currentUser = state.data.users.find(u=>u.username==='admin') || state.data.users[0] || { username:'admin', role:'superadmin', permissions:{'*':true} };
    if(lic.activated === false && lic.endsAt && todayISO() > lic.endsAt){ state.trialExpired = true; }
    await audit('APP_OPEN', 'Application started');
    await render();
  })().catch(err=>{
    console.error(err);
    $('#screen').innerHTML = `<div class="panel"><h2>Startup error</h2><pre>${escapeHtml(err.stack||err.message)}</pre></div>`;
  });
})();
