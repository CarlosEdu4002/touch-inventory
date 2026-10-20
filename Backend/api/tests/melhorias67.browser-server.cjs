// Servidor e dados exclusivamente descartáveis; nenhuma configuração operacional.
const {Pool}=require('pg');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
(async()=>{
    if(process.env.TEST_PG_ISOLADO!=='1') throw new Error('Exige PostgreSQL descartável');
    const admin=new Pool({host:'inventario-67-pg',port:5432,user:'inventario_test',database:'postgres'});
    const db='inventario_ui67_'+crypto.randomBytes(6).toString('hex');
    await admin.query(`CREATE DATABASE ${db}`);
    Object.assign(process.env,{DB_HOST:'inventario-67-pg',DB_PORT:'5432',DB_USER:'inventario_test',DB_PASSWORD:'',DB_NAME:db,NODE_ENV:'test'});
    const pool=require('../database/connection');let server;
    try {
        await require('../database/init')();
        const fixture=await require('./lixeira.browser-fixture.cjs')(pool);
        await pool.query("INSERT INTO setores(nome) VALUES('Destino navegador 67')");
        await pool.query(`UPDATE tipos_ativo SET permite_checklist=TRUE,checklist_intervalo_meses=1,
            checklist_itens='["Identificação legível?","Equipamento íntegro?"]' WHERE id=$1`,[fixture.tipoId]);
        await pool.query('UPDATE ativos SET checklist_proxima_data=CURRENT_DATE-3 WHERE tipo_ativo_id=$1',[fixture.tipoId]);
        await fs.writeFile('/tmp/ui67.json',JSON.stringify(fixture),{mode:0o600});
        server=await new Promise(r=>{const s=require('../server').app.listen(3000,'0.0.0.0',()=>r(s));});
        console.log('UI67_PRONTA');
        await new Promise(r=>{process.once('SIGTERM',r);process.once('SIGINT',r);});
    } finally {
        if(server) await new Promise(r=>server.close(r));
        await pool.end();await admin.query(`DROP DATABASE ${db} WITH (FORCE)`);await admin.end();
    }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
