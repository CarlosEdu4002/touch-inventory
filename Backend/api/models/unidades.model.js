const pool = require("../database/connection");
const { criarEstruturaUnidade } = require("../database/init");
async function listar(usuario) {
    const r = await pool.query(
        "SELECT u.id,u.nome,u.ativo,(u.logo IS NOT NULL) AS tem_logo FROM public.unidades u " +
        "WHERE u.ativo=TRUE AND ($1='admin' OR EXISTS (SELECT 1 FROM public.usuario_unidades x " +
        "WHERE x.unidade_id=u.id AND x.usuario_id=$2)) ORDER BY u.nome", [usuario.perfil, usuario.id]
    );
    if(usuario.perfil==="admin")return r.rows;
    const acessiveis=[];
    for(const unidade of r.rows) {
        if((await permissoes(usuario,unidade.id)).length)acessiveis.push(unidade);
    }
    return acessiveis;
}
async function criar(nome, logo, mime) {
    const cliente = await pool.connect();
    try {
        await cliente.query("BEGIN");
        // Serializa cadastros concorrentes sem bloquear operações patrimoniais.
        await cliente.query("SELECT pg_advisory_xact_lock(67072027)");
        const id = Number((await cliente.query("SELECT nextval('public.unidades_id_seq') AS id")).rows[0].id);
        const schema = id === 1 ? "public" : "unidade_" + id;
        // A unicidade do nome falha antes do trabalho de criar a estrutura.
        // O cadastro ainda não fica visível até a estrutura e o COMMIT terminarem.
        const r = await cliente.query(
            "INSERT INTO public.unidades(id,nome,schema_nome,logo,logo_mime) VALUES($1,$2,$3,$4,$5) " +
            "RETURNING id,nome,ativo,(logo IS NOT NULL) AS tem_logo",
            [id,nome,schema,logo,mime]
        );
        if (id !== 1) await criarEstruturaUnidade(cliente, schema);
        await cliente.query("COMMIT");
        return r.rows[0];
    } catch (erro) {
        await cliente.query("ROLLBACK");
        throw erro;
    } finally { cliente.release(); }
}
async function atualizar(id, nome, logo, mime, alterarLogo) {
    const r = await pool.query(
        "UPDATE public.unidades SET nome=$2,logo=CASE WHEN $3 THEN $4 ELSE logo END," +
        "logo_mime=CASE WHEN $3 THEN $5 ELSE logo_mime END WHERE id=$1 " +
        "RETURNING id,nome,ativo,(logo IS NOT NULL) AS tem_logo",
        [id,nome,alterarLogo,logo,mime]
    );
    return r.rows[0];
}
async function buscar(id) {
    const r = await pool.query("SELECT * FROM public.unidades WHERE id=$1 AND ativo=TRUE", [id]);
    return r.rows[0];
}
async function permissoes(usuario, unidadeId) {
    if (usuario.perfil === "admin") return [];
    const unidade=await buscar(unidadeId);
    if(!unidade || !/^public$|^unidade_[1-9][0-9]*$/.test(unidade.schema_nome))return [];
    const r = await pool.query(
        "SELECT setor_id FROM public.usuario_unidades WHERE usuario_id=$1 AND unidade_id=$2 ORDER BY setor_id",
        [usuario.id,unidadeId]
    );
    const ids=r.rows.map(x=>x.setor_id);
    if(!ids.length)return [];
    const ativos=await pool.query(
        'SELECT id FROM "'+unidade.schema_nome+'".setores WHERE id=ANY($1::int[]) AND ativo=TRUE ORDER BY id',[ids]
    );
    return ativos.rows.map(x=>x.id);
}
async function selecionar(token, unidadeId, setorId) {
    await pool.query(
        "UPDATE public.sessoes SET unidade_id=$2,setor_id=$3,contexto_versao=contexto_versao+1 WHERE token_hash=$1",
        [token,unidadeId,setorId]
    );
}
async function schemasAtivos() {
    const r = await pool.query("SELECT schema_nome FROM public.unidades WHERE ativo=TRUE");
    return r.rows.map(x => x.schema_nome);
}
module.exports={listar,criar,atualizar,buscar,permissoes,selecionar,schemasAtivos};
