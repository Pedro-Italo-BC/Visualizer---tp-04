const ArquivoStorage = (() => {
    const TAM_CABECALHO = 12;
    const TAM_LAPIDE = 1;
    const TAM_TAMANHO = 2;
    const OFFSET_LISTA_EXCLUIDOS = 4;
    const LAPIDE_ATIVO = " ".charCodeAt(0);
    const LAPIDE_EXCLUIDO = "*".charCodeAt(0);
    const TAM_ID_REGISTRO = 4;
    const PREFIXO_REGISTRO = [0x52, 0x01];

    function normalizarByte(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return 0;
        return ((Math.trunc(numero) % 256) + 256) % 256;
    }

    function escreverBytes(vetor, offset, bytes) {
        bytes.forEach((byte, index) => {
            vetor[offset + index] = normalizarByte(byte);
        });
    }

    function paraInt8(vetor) {
        return new Int8Array(vetor.map(normalizarByte));
    }

    function lerInt(vetor, offset) {
        return ByteStream.readInt(paraInt8(vetor), offset);
    }

    function lerShort(vetor, offset) {
        return ByteStream.readShort(paraInt8(vetor), offset);
    }

    function lerLong(vetor, offset) {
        return Number(ByteStream.readLong(paraInt8(vetor), offset));
    }

    function escreverInt(vetor, offset, valor) {
        escreverBytes(vetor, offset, ByteStream.writeInt(valor));
    }

    function escreverShort(vetor, offset, valor) {
        escreverBytes(vetor, offset, ByteStream.writeShort(valor));
    }

    function escreverLong(vetor, offset, valor) {
        escreverBytes(vetor, offset, ByteStream.writeLong(valor));
    }

    function garantirCabecalho(arquivo) {
        const vetor = Array.isArray(arquivo) ? arquivo.map(normalizarByte) : [];
        const tamanhoOriginal = vetor.length;

        while (vetor.length < TAM_CABECALHO) {
            vetor.push(0);
        }

        if (tamanhoOriginal < TAM_CABECALHO) {
            escreverLong(vetor, OFFSET_LISTA_EXCLUIDOS, -1);
        }

        return vetor;
    }

    function obterEntidade(entidadeId) {
        const entidade = EntidadeStorage.buscarPorId(entidadeId);
        if (!entidade) throw new Error("Entidade nao encontrada.");
        return entidade;
    }

    function carregarArquivo(entidadeId) {
        const entidade = obterEntidade(entidadeId);
        return garantirCabecalho(EntidadeStorage.carregarArquivo(entidade) || []);
    }

    function salvarArquivo(entidade, arquivo) {
        entidade.vetorBytes = arquivo;
        localStorage.setItem(
            EntidadeStorage.obterChaveArquivo(entidade),
            JSON.stringify(arquivo)
        );
    }

    function normalizarValores(valores) {
        return valores.map((valor) => ({
            nome: valor.nome,
            tipo: valor.tipo,
            valor: valor.valor
        }));
    }

    function valoresParaObjeto(valores) {
        const objeto = {};
        valores.forEach((campo) => {
            objeto[campo.nome] = campo.valor;
        });
        return objeto;
    }

    function construirBytesRegistro(id, valores) {
        const normalizados = normalizarValores(valores);
        const bytesValores = ConversorDinamico.toByteArray(
            normalizados.map((campo) => ({
                nome: campo.nome,
                tipo: campo.tipo
            })),
            normalizados.map((campo) => campo.valor)
        );
        const bytesId = ByteStream.writeInt(Number(id) || 0);
        return [...PREFIXO_REGISTRO, ...bytesId, ...bytesValores];
    }

    function extrairIdDoPayload(bytes) {
        const vetor = (bytes || []).map(normalizarByte);
        if (vetor.length >= PREFIXO_REGISTRO.length + TAM_ID_REGISTRO
            && vetor[0] === PREFIXO_REGISTRO[0]
            && vetor[1] === PREFIXO_REGISTRO[1]) {
            return Number(ByteStream.readInt(new Int8Array(vetor.slice(2, 2 + TAM_ID_REGISTRO)), 0));
        }
        return null;
    }

    function removerPrefixoRegistro(bytes) {
        const vetor = (bytes || []).map(normalizarByte);
        if (vetor.length >= PREFIXO_REGISTRO.length + TAM_ID_REGISTRO
            && vetor[0] === PREFIXO_REGISTRO[0]
            && vetor[1] === PREFIXO_REGISTRO[1]) {
            return vetor.slice(2 + TAM_ID_REGISTRO);
        }
        return vetor;
    }

    const TAMANHOS_TIPO_VETOR_ANTIGO = {
        String: 64,
        Integer: 4,
        Float: 8,
        Boolean: 1
    };

    function normalizarAtributos(atributos) {
        return (atributos || []).map((atributo) => ({
            nome: String(atributo.nome || "").trim(),
            tipo: atributo.tipo || "String",
            tamanho: TAMANHOS_TIPO_VETOR_ANTIGO[atributo.tipo] || TAMANHOS_TIPO_VETOR_ANTIGO.String
        }));
    }

    function atributosDaEntidade(entidade) {
        return Array.isArray(entidade.atributos) ? entidade.atributos : entidade.lista_attr || [];
    }

    function payloadRegistro(arquivo, endereco) {
        const tamanho = lerShort(arquivo, endereco + TAM_LAPIDE);
        const inicio = endereco + TAM_LAPIDE + TAM_TAMANHO;
        const fim = inicio + tamanho;

        if (tamanho < 0 || fim > arquivo.length) return null;
        return arquivo.slice(inicio, fim);
    }

    function valoresObjetoPorBytes(entidade, bytes) {
        const atributos = atributosDaEntidade(entidade);
        const payload = removerPrefixoRegistro(bytes);
        const valores = ConversorDinamico.fromByteArray(atributos, new Int8Array(payload.map(normalizarByte)));
        const objeto = {};

        atributos.forEach((atributo, index) => {
            objeto[atributo.nome] = valores[index];
        });

        return {
            id: extrairIdDoPayload(bytes),
            valores: objeto
        };
    }

    function decodificarRegistro(entidade, payload, slot) {
        if (!Array.isArray(payload) || payload.length === 0) {
            return { id: null, valores: {} };
        }

        if (slot && slot.lapide === LAPIDE_EXCLUIDO) {
            return { id: null, valores: {} };
        }

        try {
            return valoresObjetoPorBytes(entidade, payload);
        } catch (erro) {
            return { id: null, valores: {} };
        }
    }

    function getDeleted(arquivo, tamanhoNecessario) {
        let anterior = OFFSET_LISTA_EXCLUIDOS;
        let endereco = lerLong(arquivo, anterior);

        while (endereco !== -1) {
            const tamanho = lerShort(arquivo, endereco + TAM_LAPIDE);
            const proximo = lerLong(arquivo, endereco + TAM_LAPIDE + TAM_TAMANHO);

            if (tamanho > tamanhoNecessario) {
                escreverLong(
                    arquivo,
                    anterior === OFFSET_LISTA_EXCLUIDOS ? anterior : anterior + TAM_LAPIDE + TAM_TAMANHO,
                    proximo
                );
                break;
            }

            anterior = endereco;
            endereco = proximo;
        }

        return endereco;
    }

    function addDeleted(arquivo, tamanhoEspaco, enderecoEspaco) {
        let anterior = OFFSET_LISTA_EXCLUIDOS;
        let endereco = lerLong(arquivo, anterior);

        if (endereco === -1) {
            escreverLong(arquivo, OFFSET_LISTA_EXCLUIDOS, enderecoEspaco);
            escreverLong(arquivo, enderecoEspaco + TAM_LAPIDE + TAM_TAMANHO, -1);
            return;
        }

        while (endereco !== -1) {
            const tamanho = lerShort(arquivo, endereco + TAM_LAPIDE);
            const proximo = lerLong(arquivo, endereco + TAM_LAPIDE + TAM_TAMANHO);

            if (tamanho > tamanhoEspaco) {
                escreverLong(
                    arquivo,
                    anterior === OFFSET_LISTA_EXCLUIDOS ? anterior : anterior + TAM_LAPIDE + TAM_TAMANHO,
                    enderecoEspaco
                );
                escreverLong(arquivo, enderecoEspaco + TAM_LAPIDE + TAM_TAMANHO, endereco);
                return;
            }

            if (proximo === -1) {
                escreverLong(arquivo, endereco + TAM_LAPIDE + TAM_TAMANHO, enderecoEspaco);
                escreverLong(arquivo, enderecoEspaco + TAM_LAPIDE + TAM_TAMANHO, -1);
                return;
            }

            anterior = endereco;
            endereco = proximo;
        }
    }

    function escreverTamanhoRegistro(arquivo, offset, tamanhoBytes) {
        const tamanho = Math.max(0, Math.min(0x7fff, Number(tamanhoBytes) || 0));
        escreverShort(arquivo, offset, tamanho);
        return tamanho;
    }

    function escreverRegistroNoFim(arquivo, bytes) {
        const endereco = arquivo.length;
        arquivo.push(LAPIDE_ATIVO);
        escreverTamanhoRegistro(arquivo, endereco + TAM_LAPIDE, bytes.length);
        arquivo.push(...bytes.map(normalizarByte));
        return endereco;
    }

    function escreverRegistroReaproveitado(arquivo, endereco, bytes) {
        const tamanhoAnterior = lerShort(arquivo, endereco + TAM_LAPIDE);
        arquivo[endereco] = LAPIDE_ATIVO;
        escreverTamanhoRegistro(arquivo, endereco + TAM_LAPIDE, bytes.length);
        escreverBytes(arquivo, endereco + TAM_LAPIDE + TAM_TAMANHO, bytes);

        const fimPayload = endereco + TAM_LAPIDE + TAM_TAMANHO + bytes.length;
        const fimSlot = endereco + TAM_LAPIDE + TAM_TAMANHO + Math.max(tamanhoAnterior, bytes.length);
        for (let i = fimPayload; i < fimSlot; i++) {
            arquivo[i] = 0;
        }
    }

    function obterRegistroAtivo(entidade, id) {
        return (entidade.registros || []).find((registro) => {
            if (registro.id === id) return registro.ativo;
            return Number.isFinite(Number(registro.id)) && Number.isFinite(Number(id))
                ? Number(registro.id) === Number(id) && registro.ativo
                : false;
        }) || null;
    }

    function buscarMetadadoPorEndereco(entidade, endereco) {
        return (entidade.registros || []).find((registro) => Number(registro.endereco) === Number(endereco)) || null;
    }

    function listarSlots(arquivo) {
        const slots = [];
        let endereco = TAM_CABECALHO;

        while (endereco + TAM_LAPIDE + TAM_TAMANHO <= arquivo.length) {
            const tamanho = lerShort(arquivo, endereco + TAM_LAPIDE);
            if (tamanho < 0 || endereco + TAM_LAPIDE + TAM_TAMANHO + tamanho > arquivo.length) break;

            slots.push({
                endereco,
                lapide: arquivo[endereco],
                tamanho
            });

            endereco += TAM_LAPIDE + TAM_TAMANHO + tamanho;
        }

        return slots;
    }

    function sincronizarEnderecosAusentes(entidade, arquivo) {
        const registros = entidade.registros || [];
        if (registros.every((registro) => Number.isFinite(Number(registro.endereco)))) return;

        const slots = listarSlots(arquivo);
        registros.forEach((registro, index) => {
            if (!Number.isFinite(Number(registro.endereco)) && slots[index]) {
                registro.endereco = slots[index].endereco;
            }
        });
    }

    function sincronizarMetadadoRegistro(entidade, registro) {
        const metadado = (entidade.registros || []).find((item) => Number(item.id) === Number(registro.id));
        if (!metadado) {
            entidade.registros = Array.isArray(entidade.registros) ? entidade.registros : [];
            entidade.registros.push({ ...registro });
            return entidade.registros[entidade.registros.length - 1];
        }

        Object.assign(metadado, {
            ...registro,
            criadoEm: metadado.criadoEm || registro.criadoEm,
            atualizadoEm: registro.atualizadoEm || metadado.atualizadoEm
        });
        return metadado;
    }

    function buscarRegistroNoArquivo(entidade, arquivo, id) {
        const registros = listarRegistrosDoArquivo(entidade, arquivo);
        return registros.find((registro) => {
            if (!registro || !registro.ativo) return false;
            if (registro.id === id) return true;
            return Number.isFinite(Number(registro.id)) && Number.isFinite(Number(id))
                ? Number(registro.id) === Number(id)
                : false;
        }) || null;
    }

    function montarRegistroDoArquivo(entidade, arquivo, slot, index) {
        const metadado = buscarMetadadoPorEndereco(entidade, slot.endereco);
        const payload = payloadRegistro(arquivo, slot.endereco) || [];
        let dados = { id: null, valores: {} };
        let erroDecodificacao = "";

        try {
            dados = decodificarRegistro(entidade, payload, slot);
            if (!dados || typeof dados !== "object") {
                dados = { id: null, valores: {} };
            }
        } catch (erro) {
            erroDecodificacao = erro.message || "Nao foi possivel decodificar o registro.";
        }

        const id = dados.id ?? (metadado ? metadado.id : index + 1);
        const registro = {
            id,
            endereco: slot.endereco,
            ativo: slot.lapide !== LAPIDE_EXCLUIDO,
            valores: dados.valores || {},
            tamanho: slot.tamanho,
            lapide: slot.lapide,
            origem: "vetorBytes",
            erroDecodificacao,
            criadoEm: metadado ? metadado.criadoEm : null,
            atualizadoEm: metadado ? metadado.atualizadoEm : null
        };

        if (metadado) {
            sincronizarMetadadoRegistro(entidade, registro);
        }

        return registro;
    }

    function listarRegistrosDoArquivo(entidade, arquivo) {
        return listarSlots(arquivo).map((slot, index) => montarRegistroDoArquivo(entidade, arquivo, slot, index));
    }

    function lerUint32Little(vetor, offset) {
        const b0 = normalizarByte(vetor[offset]);
        const b1 = normalizarByte(vetor[offset + 1]);
        const b2 = normalizarByte(vetor[offset + 2]);
        const b3 = normalizarByte(vetor[offset + 3]);
        return ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0;
    }

    function valoresObjetoPorBytesVetor(entidade, bytes) {
        const atributos = normalizarAtributos(atributosDaEntidade(entidade));
        const objeto = {};
        let offset = 0;

        atributos.forEach((atributo) => {
            if (atributo.tipo === "Boolean") {
                objeto[atributo.nome] = normalizarByte(bytes[offset]) !== 0;
                offset += 1;
                return;
            }

            if (atributo.tipo === "Integer") {
                objeto[atributo.nome] = lerUint32Little(bytes, offset);
                offset += 4;
                return;
            }

            if (atributo.tipo === "Float") {
                const buffer = new ArrayBuffer(8);
                const view = new Uint8Array(buffer);
                for (let i = 0; i < 8; i++) {
                    view[i] = normalizarByte(bytes[offset + i]);
                }
                objeto[atributo.nome] = new DataView(buffer).getFloat64(0, true);
                offset += 8;
                return;
            }

            const tamanhoCampo = atributo.tamanho || 0;
            let texto = "";
            for (let i = 0; i < tamanhoCampo && offset + i < bytes.length; i++) {
                const byte = normalizarByte(bytes[offset + i]);
                if (byte === 0) break;
                texto += String.fromCharCode(byte);
            }
            objeto[atributo.nome] = texto;
            offset += tamanhoCampo;
        });

        return objeto;
    }

    function montarRegistroDoVetorBytes(entidade, arquivo, endereco, index) {
        const metadado = buscarMetadadoPorEndereco(entidade, endereco);
        const tamanhoRegistro = VetorBytesEntidade.calcularTamanhoRegistro(atributosDaEntidade(entidade));
        const payload = arquivo.slice(endereco + 8, endereco + 8 + tamanhoRegistro);
        let valores = {};
        let erroDecodificacao = "";

        try {
            valores = valoresObjetoPorBytesVetor(entidade, payload);
        } catch (erro) {
            erroDecodificacao = erro.message || "Nao foi possivel decodificar o registro no formato antigo.";
        }

        const ativo = lerUint32Little(arquivo, endereco + 4) !== 0;
        return {
            id: metadado ? metadado.id : index + 1,
            endereco,
            ativo,
            valores,
            tamanho: tamanhoRegistro,
            lapide: ativo ? LAPIDE_ATIVO : LAPIDE_EXCLUIDO,
            origem: "vetorBytes-antigo",
            erroDecodificacao,
            criadoEm: metadado ? metadado.criadoEm : null,
            atualizadoEm: metadado ? metadado.atualizadoEm : null
        };
    }

    function validarFormatoVetorBytes(entidade, arquivo) {
        if (!Array.isArray(arquivo) || arquivo.length < TAM_CABECALHO + 16) return false;
        const proxima = lerUint32Little(arquivo, TAM_CABECALHO);
        const ativo = lerUint32Little(arquivo, TAM_CABECALHO + 4);
        const tamanhoRegistro = VetorBytesEntidade.calcularTamanhoRegistro(atributosDaEntidade(entidade));
        if (ativo !== 0 && ativo !== 1) return false;
        if (proxima !== 0 && proxima <= TAM_CABECALHO) return false;
        if (TAM_CABECALHO + 8 + tamanhoRegistro > arquivo.length) return false;
        return true;
    }

    function listarRegistrosVetorBytes(entidade, arquivo) {
        const registros = [];
        const tamanhoRegistro = VetorBytesEntidade.calcularTamanhoRegistro(atributosDaEntidade(entidade));
        let endereco = TAM_CABECALHO;
        let index = 0;

        while (endereco + 8 + tamanhoRegistro <= arquivo.length) {
            registros.push(montarRegistroDoVetorBytes(entidade, arquivo, endereco, index));
            const proxima = lerUint32Little(arquivo, endereco);
            if (proxima === 0 || proxima <= endereco || proxima + 8 + tamanhoRegistro > arquivo.length) break;
            endereco = proxima;
            index += 1;
        }

        return registros;
    }

    function create(entidadeId, valores) {
        const entidade = obterEntidade(entidadeId);
        const arquivo = carregarArquivo(entidadeId);
        const proximoId = lerInt(arquivo, 0) + 1;
        const bytes = construirBytesRegistro(proximoId, valores);
        const enderecoLivre = getDeleted(arquivo, bytes.length);
        const endereco = enderecoLivre === -1
            ? escreverRegistroNoFim(arquivo, bytes)
            : enderecoLivre;

        escreverInt(arquivo, 0, proximoId);

        if (enderecoLivre !== -1) {
            escreverRegistroReaproveitado(arquivo, endereco, bytes);
        }

        const registro = {
            id: proximoId,
            endereco,
            ativo: true,
            valores: valoresParaObjeto(valores),
            tamanho: bytes.length,
            lapide: LAPIDE_ATIVO,
            origem: "vetorBytes",
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
        };

        sincronizarMetadadoRegistro(entidade, registro);
        salvarArquivo(entidade, arquivo);
        EntidadeStorage.salvar(entidade);
        return proximoId;
    }

    function read(entidadeId, id) {
        const entidade = obterEntidade(entidadeId);
        const arquivo = carregarArquivo(entidadeId);
        sincronizarEnderecosAusentes(entidade, arquivo);
        let registros = listarRegistrosDoArquivo(entidade, arquivo);

        const precisaFallbackAntigo = registros.length === 0
            || registros.some((registro) => registro.erroDecodificacao);

        if (precisaFallbackAntigo && validarFormatoVetorBytes(entidade, arquivo)) {
            registros = listarRegistrosVetorBytes(entidade, arquivo);
        }

        if (id === undefined || id === null || id === "") {
            return registros;
        }

        return registros.find((registro) => {
            if (registro.id === id) return registro.ativo;
            return Number.isFinite(Number(registro.id)) && Number.isFinite(Number(id))
                ? Number(registro.id) === Number(id) && registro.ativo
                : false;
        }) || null;
    }

    function remove(entidadeId, id) {
        const entidade = obterEntidade(entidadeId);
        const arquivo = carregarArquivo(entidadeId);
        sincronizarEnderecosAusentes(entidade, arquivo);
        const registro = buscarRegistroNoArquivo(entidade, arquivo, id);

        if (!registro || !Number.isFinite(Number(registro.endereco))) return false;

        const endereco = Number(registro.endereco);
        if (arquivo[endereco] !== LAPIDE_ATIVO) return false;

        const tamanho = lerShort(arquivo, endereco + TAM_LAPIDE);
        arquivo[endereco] = LAPIDE_EXCLUIDO;
        addDeleted(arquivo, tamanho, endereco);

        registro.ativo = false;
        registro.atualizadoEm = new Date().toISOString();
        sincronizarMetadadoRegistro(entidade, registro);

        salvarArquivo(entidade, arquivo);
        EntidadeStorage.salvar(entidade);
        return true;
    }

    function update(entidadeId, id, valores) {
        const entidade = obterEntidade(entidadeId);
        const arquivo = carregarArquivo(entidadeId);
        sincronizarEnderecosAusentes(entidade, arquivo);
        const registro = buscarRegistroNoArquivo(entidade, arquivo, id);

        if (!registro || !Number.isFinite(Number(registro.endereco))) return false;

        const enderecoAtual = Number(registro.endereco);
        if (arquivo[enderecoAtual] !== LAPIDE_ATIVO) return false;

        const tamanhoAtual = lerShort(arquivo, enderecoAtual + TAM_LAPIDE);
        const novosBytes = construirBytesRegistro(registro.id, valores);

        if (novosBytes.length <= tamanhoAtual) {
            escreverBytes(arquivo, enderecoAtual + TAM_LAPIDE + TAM_TAMANHO, novosBytes);
        } else {
            arquivo[enderecoAtual] = LAPIDE_EXCLUIDO;
            addDeleted(arquivo, tamanhoAtual, enderecoAtual);

            const enderecoLivre = getDeleted(arquivo, novosBytes.length);
            const novoEndereco = enderecoLivre === -1
                ? escreverRegistroNoFim(arquivo, novosBytes)
                : enderecoLivre;

            if (enderecoLivre !== -1) {
                escreverRegistroReaproveitado(arquivo, novoEndereco, novosBytes);
            }

            registro.endereco = novoEndereco;
        }

        registro.valores = valoresParaObjeto(valores);
        registro.atualizadoEm = new Date().toISOString();
        sincronizarMetadadoRegistro(entidade, registro);

        salvarArquivo(entidade, arquivo);
        EntidadeStorage.salvar(entidade);
        return true;
    }

    return {
        create,
        read,
        delete: remove,
        update,
        carregarArquivo
    };
})();
