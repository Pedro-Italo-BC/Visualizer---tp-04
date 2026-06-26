const EntidadeStorage = (() => {
    const CHAVE_METADADOS = "visualizer.entidades.v1";

    function carregarBanco() {
        const bruto = localStorage.getItem(CHAVE_METADADOS);
        if (!bruto) return { entidades: [] };

        try {
            const banco = JSON.parse(bruto);
            return {
                entidades: Array.isArray(banco.entidades) ? banco.entidades : []
            };
        } catch (erro) {
            console.warn("Nao foi possivel carregar entidades do localStorage.", erro);
            return { entidades: [] };
        }
    }

    function salvarBanco(banco) {
        localStorage.setItem(CHAVE_METADADOS, JSON.stringify({
            entidades: banco.entidades.map((entidade) => entidade.paraJSON ? entidade.paraJSON() : entidade)
        }));
    }

    function obterChaveArquivo(entidadeOuId) {
        if (typeof entidadeOuId === "string") return Entidade.criarChaveArquivo(entidadeOuId);
        return entidadeOuId.arquivoKey || Entidade.criarChaveArquivo(entidadeOuId.id);
    }

    function carregarArquivo(entidadeOuId) {
        const chave = obterChaveArquivo(entidadeOuId);
        const bruto = localStorage.getItem(chave);

        if (!bruto) return null;

        try {
            const vetor = JSON.parse(bruto);
            return Array.isArray(vetor) ? vetor : null;
        } catch (erro) {
            console.warn("Nao foi possivel carregar arquivo de bytes da entidade.", erro);
            return null;
        }
    }

    function salvarArquivo(entidade) {
        const chave = obterChaveArquivo(entidade);
        const vetor = Array.isArray(entidade.vetorBytes)
            ? entidade.vetorBytes
            : VetorBytesEntidade.criarVetorInicial(); //////////////////////alterar

        localStorage.setItem(chave, JSON.stringify(vetor));
        return vetor;
    }

    function criarArquivoInicial(entidade) {
        const chave = obterChaveArquivo(entidade);
        const existente = carregarArquivo(entidade);

        if (existente) {
            entidade.vetorBytes = existente;
            return existente;
        }

        const vetorInicial = VetorBytesEntidade.criarVetorInicial();
        localStorage.setItem(chave, JSON.stringify(vetorInicial));
        entidade.vetorBytes = vetorInicial;
        return vetorInicial;
    }

    function hidratarEntidade(item) {
        const entidade = Entidade.deObjeto(item);
        const arquivo = carregarArquivo(entidade);

        if (arquivo) {
            entidade.vetorBytes = arquivo;
        } else {
            criarArquivoInicial(entidade);
        }

        return entidade;
    }

    function listar() {
        return carregarBanco().entidades.map(hidratarEntidade);
    }

    function buscarPorId(id) {
        return listar().find((entidade) => entidade.id === id) || null;
    }

    function salvar(entidade) {
        const banco = carregarBanco();
        const atualizada = entidade instanceof Entidade ? entidade : Entidade.deObjeto(entidade);
        const arquivoAtual = carregarArquivo(atualizada);

        atualizada.atualizadoEm = new Date().toISOString();
        atualizada.vetorBytes = arquivoAtual || atualizada.vetorBytes || VetorBytesEntidade.criarVetorInicial();

        if (!arquivoAtual) {
            salvarArquivo(atualizada);
        }

        const indice = banco.entidades.findIndex((item) => item.id === atualizada.id);
        if (indice >= 0) {
            banco.entidades[indice] = atualizada;
        } else {
            banco.entidades.push(atualizada);
        }

        salvarBanco(banco);
        return atualizada;
    }

    function criar(nome, atributos) {
        const entidade = new Entidade(nome, atributos);
        criarArquivoInicial(entidade);
        return salvar(entidade);
    }

    function remover(id) {
        const banco = carregarBanco();
        const entidade = banco.entidades.find((item) => item.id === id);
        const quantidadeAnterior = banco.entidades.length;

        banco.entidades = banco.entidades.filter((item) => item.id !== id);

        if (entidade) {
            localStorage.removeItem(entidade.arquivoKey || Entidade.criarChaveArquivo(entidade.id));
        }

        salvarBanco(banco);
        return banco.entidades.length < quantidadeAnterior;
    }

    function limpar() {
        const banco = carregarBanco();
        banco.entidades.forEach((entidade) => {
            localStorage.removeItem(entidade.arquivoKey || Entidade.criarChaveArquivo(entidade.id));
        });
        localStorage.removeItem(CHAVE_METADADOS);
    }

    return {
        chave: CHAVE_METADADOS,
        listar,
        buscarPorId,
        salvar,
        criar,
        remover,
        limpar,
        carregarArquivo,
        salvarArquivo,
        criarArquivoInicial,
        obterChaveArquivo
    };
})();
