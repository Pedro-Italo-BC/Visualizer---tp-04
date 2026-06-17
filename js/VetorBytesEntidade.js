//const ByteStream = require("./ByteStream");

const VetorBytesEntidade = (() => {
    const TAMANHO_CONTADOR = 4;
    const TAMANHO_ANCORA = 8;
    const TAMANHOS_TIPO = {
        String: 64,
        Integer: 4,
        Float: 8,
        Boolean: 1
    };

    function normalizarAtributos(atributos) {
        return (atributos || []).map((atributo) => ({
            nome: String(atributo.nome || "").trim(),
            tipo: atributo.tipo || "String",
            tamanho: TAMANHOS_TIPO[atributo.tipo] || TAMANHOS_TIPO.String
        }));
    }

    function calcularTamanhoRegistro(atributos) {
        return normalizarAtributos(atributos).reduce((total, atributo) => total + atributo.tamanho, 0);
    }

    function escreverUint32(vetor, offset, valor) {
        const numero = Number.isFinite(valor) && valor >= 0 ? Math.floor(valor) : 0;
        vetor[offset] = numero & 0xff;
        vetor[offset + 1] = (numero >>> 8) & 0xff;
        vetor[offset + 2] = (numero >>> 16) & 0xff;
        vetor[offset + 3] = (numero >>> 24) & 0xff;
    }

    function criarVetorInicial() {
        return [0, 0, 0, 0];
    }

    function obterRegistros(entidade) {
        return Array.isArray(entidade.registros) ? entidade.registros : [];
    }

    function obterMetricas(entidade) {
        const atributos = normalizarAtributos(entidade.atributos || entidade.lista_attr);
        const registros = obterRegistros(entidade);
        const tamanhoRegistro = calcularTamanhoRegistro(atributos);
        const ativos = registros.filter((registro) => registro.ativo).length;
        const inativos = registros.length - ativos;
        const quantidadeAncoras = registros.length;
        const primeiraAncora = registros.length > 0 ? TAMANHO_CONTADOR : -1;
        const ultimaAncora = registros.length > 0
            ? TAMANHO_CONTADOR + ((registros.length - 1) * (TAMANHO_ANCORA + tamanhoRegistro))
            : -1;
        const tamanhoEsperado = TAMANHO_CONTADOR + registros.length * (TAMANHO_ANCORA + tamanhoRegistro);
        const tamanhoVetor = Array.isArray(entidade.vetorBytes) ? entidade.vetorBytes.length : tamanhoEsperado;
        const desperdicioMemoria = inativos * (TAMANHO_ANCORA + tamanhoRegistro);

        return {
            quantidadeRegistros: registros.length,
            quantidadeAtivos: ativos,
            quantidadeInativos: inativos,
            quantidadeAncoras,
            primeiraAncora,
            ultimaAncora,
            tamanhoRegistro,
            tamanhoContador: TAMANHO_CONTADOR,
            tamanhoAncora: TAMANHO_ANCORA,
            tamanhoVetor,
            desperdicioMemoria
        };
    }

    function criarBytesRegistro(entidade, registro) {
        const atributos = normalizarAtributos(entidade.atributos || entidade.lista_attr);
        const bytes = [];

        atributos.forEach((atributo) => {
            const valor = registro.valores ? registro.valores[atributo.nome] : undefined;
            const campo = new Array(atributo.tamanho).fill(0);

            if (atributo.tipo === "Boolean") {
                campo[0] = valor ? 1 : 0;
            } else if (atributo.tipo === "Integer") {
                escreverUint32(campo, 0, Number(valor) || 0);
            } else if (atributo.tipo === "Float") {
                const buffer = new ArrayBuffer(8);
                new DataView(buffer).setFloat64(0, Number(valor) || 0, true);
                campo.splice(0, 8, ...new Uint8Array(buffer));
            } else {
                const texto = String(valor ?? "");
                for (let i = 0; i < Math.min(texto.length, atributo.tamanho); i++) {
                    campo[i] = texto.charCodeAt(i) & 0xff;
                }
            }

            bytes.push(...campo);
        });

        return bytes;
    }

    function criarVetor(entidade) {
        const registros = obterRegistros(entidade);
        const metricas = obterMetricas(entidade);
        const vetor = criarVetorInicial();
        const tamanhoRegistro = metricas.tamanhoRegistro;

        escreverUint32(vetor, 0, registros.length);

        registros.forEach((registro, index) => {
            const inicioRegistro = TAMANHO_CONTADOR + index * (TAMANHO_ANCORA + tamanhoRegistro);
            const proximaAncora = index < registros.length - 1
                ? inicioRegistro + TAMANHO_ANCORA + tamanhoRegistro
                : 0;

            escreverUint32(vetor, vetor.length, proximaAncora);
            escreverUint32(vetor, vetor.length, registro.ativo ? 1 : 0);
            vetor.push(...criarBytesRegistro(entidade, registro));
        });

        return vetor;
    }

    return {
        calcularTamanhoRegistro,
        criarVetor,
        criarVetorInicial,
        obterMetricas,
        normalizarAtributos
    };
})();



const ConversorDinamico = (() => {
function toByteArray(atributos, valores) {
    let bytesDoRegistro = [];
    // Passa de atributo em atributo olhando o que ele é
    atributos.forEach((atributo, i) => {
        const valorReal = valores[i];
        let bytesDoCampo;

        // Escolhe o conversor certo do ByteStream baseado no tipo
        if (atributo.tipo === "Integer") { //caso inteiro
            bytesDoCampo = ByteStream.writeInt(Number(valorReal) || 0);
        }else if (atributo.tipo === "Float") { //caso real
            bytesDoCampo = ByteStream.writeFloat(Number(valorReal) || 0.0);
        }else if (atributo.tipo === "Boolean") { //caso boolean
            // Garante que vire true ou false de verdade
            const bool = valorReal === true || valorReal === "true" || valorReal === 1;
            bytesDoCampo = ByteStream.writeBoolean(bool);
        }else {  //caso string
            bytesDoCampo = ByteStream.writeString(String(valorReal ?? ""));
        }

        // Adiciona os bytes desse campo no final do registro
        bytesDoRegistro.push(...bytesDoCampo);
    });

    return bytesDoRegistro; // Retorna o vetor de bytes
}




function fromByteArray(atributos, vetorDeBytes) {
    let posicaoInicial = 0;
    let valoresReconstruidos = [];
    let posicaoAtual = posicaoInicial;

    // Passa pelos atributos sabendo exatamente a ordem em que foram gravados
    atributos.forEach((atributo) => {
        let resultado;

        if (atributo.tipo === "Integer") {
            resultado = ByteStream.readInt(vetorDeBytes, posicaoAtual);
            posicaoAtual += 4; 
        } 
        else if (atributo.tipo === "Float") {
            resultado = ByteStream.readFloat(vetorDeBytes, posicaoAtual);
            posicaoAtual += 4; 
        } 
        else if (atributo.tipo === "Boolean") {
            resultado = ByteStream.readBoolean(vetorDeBytes, posicaoAtual);
            posicaoAtual += 1; 
        } 
        else { 
            resultado = ByteStream.readString(vetorDeBytes, posicaoAtual);
            // Para saber quantos bytes pular na String: 
            // Pegamos 2 bytes do tamanho + o tamanho real que o texto ocupou em bytes
            const tamanhoDoTextoEmBytes = ByteStream.readShort(vetorDeBytes, posicaoAtual);
            posicaoAtual += 2 + tamanhoDoTextoEmBytes;
        }

        // Guarda o valor traduzido na nossa lista
        valoresReconstruidos.push(resultado);
    });

    return valoresReconstruidos; // Retorna os valores normais de volta ([ "Monitor", 1250.50, true ])
}
return {
        toByteArray,
        fromByteArray
    };
})();