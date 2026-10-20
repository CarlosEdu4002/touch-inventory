require("dotenv").config({ quiet: true });
const pool = require("../database/connection");
require("../services/imagens.service").processar()
    .then(resultado => console.log(JSON.stringify(resultado)))
    .catch(erro => { console.error(erro.message); process.exitCode = 1; })
    .finally(() => pool.end());
