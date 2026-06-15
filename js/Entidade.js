class Entidade {
    constructor(nome, lista_attr = [], dados = {}) {
        this.id = dados.id || Entidade.gerarId(nome);
        this.nome = nome;
        this.lista_attr = lista_attr;
        this.arquivoKey = dados.arquivoKey || Entidade.criarChaveArquivo(this.id);
        this.criadoEm = dados.criadoEm || new Date().toISOString();
        this.atualizadoEm = dados.atualizadoEm || this.criadoEm;
        this.registros = Array.isArray(dados.registros) ? dados.registros : [];
        this.vetorBytes = Array.isArray(dados.vetorBytes)
            ? dados.vetorBytes
            : VetorBytesEntidade.criarVetorInicial();
    }

    static gerarId(nome) {
        const base = String(nome || "entidade")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "") || "entidade";

        return `${base}-${Date.now().toString(36)}`;
    }

    static criarChaveArquivo(id) {
        return `visualizer.entidade.arquivo.${id}`;
    }

    static deObjeto(objeto) {
        return new Entidade(objeto.nome, objeto.lista_attr || objeto.atributos || [], objeto);
    }

    get nomeCabecalho() {
        return `header.${this.nome}`;
    }

    get atributos() {
        return this.lista_attr;
    }

    get tamanhoRegistro() {
        return VetorBytesEntidade.calcularTamanhoRegistro(this.lista_attr);
    }

    get totalRegistros() {
        return this.registros.length;
    }

    get totalAtivos() {
        return this.registros.filter((registro) => registro.ativo).length;
    }

    get totalInativos() {
        return this.registros.filter((registro) => !registro.ativo).length;
    }

    adicionarRegistro(valores) {
        const registro = {
            id: `${this.id}-reg-${Date.now().toString(36)}`,
            ativo: true,
            valores: { ...valores },
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString()
        };

        this.registros.push(registro);
        this.sincronizarVetorBytes();
        return registro;
    }

    removerRegistro(idRegistro) {
        const registro = this.registros.find((item) => item.id === idRegistro);
        if (!registro) return false;

        registro.ativo = false;
        registro.atualizadoEm = new Date().toISOString();
        this.sincronizarVetorBytes();
        return true;
    }

    sincronizarVetorBytes() {
        this.atualizadoEm = new Date().toISOString();
        this.vetorBytes = VetorBytesEntidade.criarVetor(this);
    }

    obterMetricas() {
        return VetorBytesEntidade.obterMetricas(this);
    }

    paraJSON() {
        return {
            id: this.id,
            nome: this.nome,
            lista_attr: this.lista_attr,
            arquivoKey: this.arquivoKey,
            criadoEm: this.criadoEm,
            atualizadoEm: this.atualizadoEm,
            registros: this.registros
        };
    }
}
