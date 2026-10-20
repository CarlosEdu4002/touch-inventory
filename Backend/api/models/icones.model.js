// Função: Registra uma troca de ícone com autor, setor e valores anterior e novo.
async function registrar(cliente, evento) {
    if (evento.icone_anterior === evento.icone_novo) return;

    await cliente.query(
        `INSERT INTO historico_icones (
            entidade, registro_id, registro_nome,
            icone_anterior, icone_novo,
            usuario_id, usuario_nome, setor_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            evento.entidade,
            evento.registro_id,
            evento.registro_nome,
            evento.icone_anterior || null,
            evento.icone_novo || null,
            evento.usuario.id,
            evento.usuario.nome,
            evento.setor_id || null
        ]
    );
}

module.exports = { registrar };
