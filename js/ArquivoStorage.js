const ArquivoStorage = (() => {
    const TAM_CABECALHO = 12;
    const TAM_LAPIDE = 1;
    const TAM_TAMANHO = 2;
    const OFFSET_LISTA_EXCLUIDOS = 4;
    const LAPIDE_ATIVO = " ".charCodeAt(0);
    const LAPIDE_EXCLUIDO = "*".charCodeAt(0);

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

    function valoresParaBytes(valores) {
        const normalizados = normalizarValores(valores);
        return ConversorDinamico.toByteArray(
            normalizados.map((campo) => ({
                nome: campo.nome,
                tipo: campo.tipo
            })),
            normalizados.map((campo) => campo.valor)
        );
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

    function escreverRegistroNoFim(arquivo, bytes) {
        const endereco = arquivo.length;
        arquivo.push(LAPIDE_ATIVO);
        escreverShort(arquivo, arquivo.length, bytes.length);
        arquivo.push(...bytes.map(normalizarByte));
        return endereco;
    }

    function escreverRegistroReaproveitado(arquivo, endereco, bytes) {
        arquivo[endereco] = LAPIDE_ATIVO;
        escreverBytes(arquivo, endereco + TAM_LAPIDE + TAM_TAMANHO, bytes);
    }

    function obterRegistroAtivo(entidade, id) {
        return (entidade.registros || []).find((registro) => Number(registro.id) === Number(id) && registro.ativo) || null;
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

    function create(entidadeId, valores) {
        const entidade = obterEntidade(entidadeId);
        const arquivo = carregarArquivo(entidadeId);
        const id = lerInt(arquivo, 0) + 1;
        const bytes = valoresParaBytes(valores);
        const enderecoLivre = getDeleted(arquivo, bytes.length);
        const endereco = enderecoLivre === -1
            ? escreverRegistroNoFim(arquivo, bytes)
            : enderecoLivre;

        escreverInt(arquivo, 0, id);

        if (enderecoLivre !== -1) {
            escreverRegistroReaproveitado(arquivo, endereco, bytes);
        }

        entidade.registros.push({
            id,
            endereco,
            ativo: true,
            valores: valoresParaObjeto(valores),
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
        });

        EntidadeStorage.salvar(entidade);
        salvarArquivo(entidade, arquivo);
        return id;
    }

    function read(entidadeId, id) {
        const entidade = obterEntidade(entidadeId);
        const arquivo = carregarArquivo(entidadeId);
        sincronizarEnderecosAusentes(entidade, arquivo);

        if (id === undefined || id === null || id === "") {
            return entidade.registros || [];
        }

        return obterRegistroAtivo(entidade, id);
    }

    function remove(entidadeId, id) {
        const entidade = obterEntidade(entidadeId);
        const arquivo = carregarArquivo(entidadeId);
        sincronizarEnderecosAusentes(entidade, arquivo);
        const registro = obterRegistroAtivo(entidade, id);

        if (!registro || !Number.isFinite(Number(registro.endereco))) return false;

        const endereco = Number(registro.endereco);
        if (arquivo[endereco] !== LAPIDE_ATIVO) return false;

        const tamanho = lerShort(arquivo, endereco + TAM_LAPIDE);
        arquivo[endereco] = LAPIDE_EXCLUIDO;
        addDeleted(arquivo, tamanho, endereco);

        registro.ativo = false;
        registro.atualizadoEm = new Date().toISOString();

        EntidadeStorage.salvar(entidade);
        salvarArquivo(entidade, arquivo);
        return true;
    }

    function update(entidadeId, id, valores) {
        const entidade = obterEntidade(entidadeId);
        const arquivo = carregarArquivo(entidadeId);
        sincronizarEnderecosAusentes(entidade, arquivo);
        const registro = obterRegistroAtivo(entidade, id);

        if (!registro || !Number.isFinite(Number(registro.endereco))) return false;

        const enderecoAtual = Number(registro.endereco);
        if (arquivo[enderecoAtual] !== LAPIDE_ATIVO) return false;

        const tamanhoAtual = lerShort(arquivo, enderecoAtual + TAM_LAPIDE);
        const novosBytes = valoresParaBytes(valores);

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

        EntidadeStorage.salvar(entidade);
        salvarArquivo(entidade, arquivo);
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
