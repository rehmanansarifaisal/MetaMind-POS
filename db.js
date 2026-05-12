
(function(){
  const DB_NAME = 'metamind_pos_db';
  const DB_VERSION = 1;
  const STORES = ['settings','categories','brands','units','products','suppliers','customers','purchaseInvoices','salesInvoices','returns','users','auditLogs','inventoryMovements','license','backups'];

  function nowISO(){ return new Date().toISOString(); }
  function uid(prefix='ID'){
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8).toUpperCase();
  }

  class PosDB {
    constructor(){ this.db = null; }
    async open(){
      if(this.db) return this.db;
      this.db = await new Promise((resolve, reject)=>{
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e)=>{
          const db = req.result;
          STORES.forEach(store=>{
            if(!db.objectStoreNames.contains(store)){
              const keyPath = 'id';
              const os = db.createObjectStore(store, { keyPath });
              if(store==='categories') os.createIndex('name','name',{unique:false});
              if(store==='brands') os.createIndex('name','name',{unique:false});
              if(store==='units') os.createIndex('name','name',{unique:false});
              if(store==='products'){
                os.createIndex('name','name',{unique:false});
                os.createIndex('barcode','barcode',{unique:false});
                os.createIndex('categoryId','categoryId',{unique:false});
              }
              if(store==='users') os.createIndex('username','username',{unique:true});
              if(store==='auditLogs') os.createIndex('createdAt','createdAt',{unique:false});
              if(store==='inventoryMovements') os.createIndex('productId','productId',{unique:false});
              if(store==='salesInvoices') os.createIndex('invoiceNo','invoiceNo',{unique:true});
              if(store==='purchaseInvoices') os.createIndex('invoiceNo','invoiceNo',{unique:true});
            }
          });
        };
        req.onsuccess = ()=>resolve(req.result);
        req.onerror = ()=>reject(req.error);
      });
      return this.db;
    }
    tx(store, mode='readonly'){ return this.db.transaction(store, mode).objectStore(store); }
    async getAll(store){
      await this.open();
      return new Promise((resolve,reject)=>{
        const req = this.tx(store).getAll();
        req.onsuccess = ()=>resolve(req.result || []);
        req.onerror = ()=>reject(req.error);
      });
    }
    async get(store,id){
      await this.open();
      return new Promise((resolve,reject)=>{
        const req = this.tx(store).get(id);
        req.onsuccess = ()=>resolve(req.result || null);
        req.onerror = ()=>reject(req.error);
      });
    }
    async put(store,value){
      await this.open();
      if(!value.id) value.id = uid(store.slice(0,3).toUpperCase());
      return new Promise((resolve,reject)=>{
        const req = this.tx(store,'readwrite').put(value);
        req.onsuccess = ()=>resolve(value);
        req.onerror = ()=>reject(req.error);
      });
    }
    async del(store,id){
      await this.open();
      return new Promise((resolve,reject)=>{
        const req = this.tx(store,'readwrite').delete(id);
        req.onsuccess = ()=>resolve(true);
        req.onerror = ()=>reject(req.error);
      });
    }
    async clear(store){
      await this.open();
      return new Promise((resolve,reject)=>{
        const req = this.tx(store,'readwrite').clear();
        req.onsuccess = ()=>resolve(true);
        req.onerror = ()=>reject(req.error);
      });
    }
    async bulkPut(store, values){
      await this.open();
      const tx = this.db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      values.forEach(v=>{ if(!v.id) v.id = uid(store.slice(0,3).toUpperCase()); os.put(v); });
      return new Promise((resolve,reject)=>{
        tx.oncomplete = ()=>resolve(values);
        tx.onerror = ()=>reject(tx.error);
      });
    }
  }

  window.MetaDB = new PosDB();
  window.MetaUtil = { uid, nowISO };
})();
