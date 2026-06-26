(() => {
    const estado = {
        atributosTemporarios: []
    };

    const elementos = {
        body: document.body,
        listaEntidades: document.getElementById("entity-list"),
        modalCriacao: document.getElementById("entity-modal"),
        abrirModal: document.getElementById("open-entity-modal"),
        fecharModal: document.getElementById("close-entity-modal"),
        nomeEntidade: document.getElementById("entity-name"),
        erroNomeEntidade: document.getElementById("entity-name-error"),
        mensagemFormulario: document.getElementById("entity-form-message"),
        nomeAtributo: document.getElementById("attribute-name"),
        erroNomeAtributo: document.getElementById("attribute-name-error"),
        tipoAtributo: document.getElementById("attribute-type"),
        adicionarAtributo: document.getElementById("attribute-add"),
        listaAtributos: document.getElementById("attribute-list"),
        salvarEntidade: document.getElementById("save-entity"),
        modalInfo: document.getElementById("entity-info-modal"),
        fecharModalInfo: document.getElementById("close-info-modal"),
        tituloInfo: document.getElementById("entity-info-title"),
        subtituloInfo: document.getElementById("entity-info-subtitle"),
        gridInfo: document.getElementById("entity-info-grid"),
        atributosInfo: document.getElementById("entity-info-attributes"),
        chaveArquivoInfo: document.getElementById("entity-info-file-key"),
        bytesInfo: document.getElementById("entity-info-bytes"),
        toasts: document.getElementById("toast-stack")
    };

    function criarElemento(tag, classes = [], texto = "") {
        const elemento = document.createElement(tag);
        classes.forEach((classe) => elemento.classList.add(classe));
        if (texto) elemento.textContent = texto;
        return elemento;
    }

    function modalAberto() {
        return elementos.modalCriacao.getAttribute("aria-hidden") === "false"
            || elementos.modalInfo.getAttribute("aria-hidden") === "false";
    }

    function atualizarScrollBody() {
        elementos.body.classList.toggle("modal-open", modalAberto());
    }

    function abrirModalCriacao() {
        estado.atributosTemporarios = [];
        limparFormulario();
        renderizarAtributos();
        elementos.modalCriacao.setAttribute("aria-hidden", "false");
        atualizarScrollBody();
        elementos.nomeEntidade.focus();
    }

    function fecharModalCriacao() {
        elementos.modalCriacao.setAttribute("aria-hidden", "true");
        atualizarScrollBody();
    }

    function abrirModalInfo(entidade) {
        renderizarInformacoes(entidade);
        elementos.modalInfo.setAttribute("aria-hidden", "false");
        atualizarScrollBody();
        elementos.fecharModalInfo.focus();
    }

    function fecharModalInfo() {
        elementos.modalInfo.setAttribute("aria-hidden", "true");
        atualizarScrollBody();
    }

    function limparFormulario() {
        elementos.nomeEntidade.value = "";
        elementos.nomeAtributo.value = "";
        elementos.tipoAtributo.value = "String";
        limparErroCampo(elementos.nomeEntidade, elementos.erroNomeEntidade);
        limparErroCampo(elementos.nomeAtributo, elementos.erroNomeAtributo);
        setMensagemFormulario("");
    }

    function setMensagemFormulario(texto, tipo = "error") {
        elementos.mensagemFormulario.textContent = texto;
        elementos.mensagemFormulario.dataset.type = tipo;
        elementos.mensagemFormulario.classList.toggle("is-visible", Boolean(texto));
    }

    function setErroCampo(input, erro, mensagem) {
        input.classList.add("input-error");
        erro.textContent = mensagem;
    }

    function limparErroCampo(input, erro) {
        input.classList.remove("input-error");
        erro.textContent = "";
    }

    function mostrarToast(texto, tipo = "success") {
        const toast = criarElemento("div", ["toast", `toast-${tipo}`], texto);
        elementos.toasts.appendChild(toast);

        window.setTimeout(() => {
            toast.classList.add("toast-hide");
            window.setTimeout(() => toast.remove(), 180);
        }, 2600);
    }

    function renderizarAtributos() {
        elementos.listaAtributos.innerHTML = "";

        if (estado.atributosTemporarios.length === 0) {
            const vazio = criarElemento("li", ["attribute-empty"], "Nenhum atributo criado.");
            elementos.listaAtributos.appendChild(vazio);
            return;
        }

        estado.atributosTemporarios.forEach((atributo, index) => {
            const item = criarElemento("li", ["attribute-item"]);
            const nome = criarElemento("span", [], atributo.nome);
            const tipo = criarElemento("span", ["attribute-badge"], atributo.tipo);
            const botaoExcluir = criarElemento("button", ["attribute-delete"]);
            botaoExcluir.type = "button";
            botaoExcluir.dataset.index = String(index);
            botaoExcluir.setAttribute("aria-label", `Excluir atributo ${atributo.nome}`);
            botaoExcluir.innerHTML = '<span class="material-symbols-outlined">delete</span>';

            item.append(nome, tipo, botaoExcluir);
            elementos.listaAtributos.appendChild(item);
        });
    }

    function adicionarAtributo() {
        const nome = elementos.nomeAtributo.value.trim();
        const tipo = elementos.tipoAtributo.value;
        limparErroCampo(elementos.nomeAtributo, elementos.erroNomeAtributo);
        setMensagemFormulario("");

        if (!nome) {
            setErroCampo(elementos.nomeAtributo, elementos.erroNomeAtributo, "Informe o nome do atributo.");
            setMensagemFormulario("Corrija os campos destacados antes de continuar.");
            elementos.nomeAtributo.focus();
            return;
        }

        const jaExiste = estado.atributosTemporarios.some((atributo) => (
            atributo.nome.toLowerCase() === nome.toLowerCase()
        ));
        if (jaExiste) {
            setErroCampo(elementos.nomeAtributo, elementos.erroNomeAtributo, "Esse atributo ja foi adicionado.");
            setMensagemFormulario("Cada atributo precisa ter um nome unico dentro da entidade.");
            elementos.nomeAtributo.focus();
            return;
        }

        estado.atributosTemporarios.push({ nome, tipo });
        elementos.nomeAtributo.value = "";
        elementos.tipoAtributo.value = "String";
        elementos.nomeAtributo.focus();
        renderizarAtributos();
        setMensagemFormulario("Atributo adicionado.", "success");
    }

    function validarEntidade() {
        const nome = elementos.nomeEntidade.value.trim();
        const entidades = EntidadeStorage.listar();
        let valido = true;

        limparErroCampo(elementos.nomeEntidade, elementos.erroNomeEntidade);
        limparErroCampo(elementos.nomeAtributo, elementos.erroNomeAtributo);
        setMensagemFormulario("");

        if (!nome) {
            setErroCampo(elementos.nomeEntidade, elementos.erroNomeEntidade, "Informe o nome da entidade.");
            valido = false;
        }

        const nomeEmUso = entidades.some((entidade) => entidade.nome.toLowerCase() === nome.toLowerCase());
        if (nome && nomeEmUso) {
            setErroCampo(elementos.nomeEntidade, elementos.erroNomeEntidade, "Ja existe uma entidade com esse nome.");
            valido = false;
        }

        if (estado.atributosTemporarios.length === 0) {
            setErroCampo(elementos.nomeAtributo, elementos.erroNomeAtributo, "Crie pelo menos um atributo.");
            valido = false;
        }

        if (!valido) {
            setMensagemFormulario("Nao foi possivel criar a entidade. Revise os campos destacados.");
        }

        return valido;
    }

    function salvarEntidade() {
        if (!validarEntidade()) return;

        const nome = elementos.nomeEntidade.value.trim();
        EntidadeStorage.criar(nome, estado.atributosTemporarios);
        fecharModalCriacao();
        renderizarEntidades();
        mostrarToast("Entidade criada e arquivo de bytes inicializado.");
    }

    function formatarBytes(total) {
        if (total === 1) return "1 Byte";
        return `${total} Bytes`;
    }

    function formatarEndereco(valor) {
        if (valor < 0) return "-";
        return `0x${valor.toString(16).toUpperCase().padStart(4, "0")}`;
    }

    function formatarData(iso) {
        return new Date(iso).toLocaleString("pt-BR");
    }

    function criarCardInfo(rotulo, valor, detalhe = "") {
        const card = criarElemento("div", ["info-card"]);
        const label = criarElemento("span", ["info-label"], rotulo);
        const value = criarElemento("strong", [], String(valor));
        card.append(label, value);
        if (detalhe) card.appendChild(criarElemento("small", [], detalhe));
        return card;
    }

    function renderizarInformacoes(entidade) {
        const metricas = entidade.obterMetricas();
        const arquivo = EntidadeStorage.carregarArquivo(entidade) || VetorBytesEntidade.criarVetorInicial();

        elementos.tituloInfo.textContent = entidade.nome;
        elementos.subtituloInfo.textContent = `${entidade.nomeCabecalho} - criado em ${formatarData(entidade.criadoEm)}`;
        elementos.gridInfo.innerHTML = "";
        elementos.atributosInfo.innerHTML = "";
        elementos.bytesInfo.innerHTML = "";
        elementos.chaveArquivoInfo.textContent = entidade.arquivoKey;

        elementos.gridInfo.append(
            criarCardInfo("Registros", metricas.quantidadeRegistros),
            criarCardInfo("Ativos", metricas.quantidadeAtivos),
            criarCardInfo("Inativos", metricas.quantidadeInativos),
            criarCardInfo("Ancoras", metricas.quantidadeAncoras),
            criarCardInfo("Tamanho do arquivo", formatarBytes(arquivo.length), "vetor salvo no localStorage"),
        );

        entidade.atributos.forEach((atributo) => {
            const item = criarElemento("li", ["info-attribute-item"]);
            item.append(
                criarElemento("span", [], atributo.nome),
                criarElemento("strong", [], atributo.tipo),
                criarElemento("small", [], atributo.tipo.toLowerCase() === "string" ? "Dinâmico" : `${VetorBytesEntidade.normalizarAtributos([atributo])[0].tamanho} bytes`)
            );
            elementos.atributosInfo.appendChild(item);
        });

        arquivo.slice(0, 96).forEach((byte) => {
            elementos.bytesInfo.appendChild(criarElemento(
                "span",
                ["byte-chip"],
                Number(byte).toString(16).toUpperCase().padStart(2, "0")
            ));
        });

        if (arquivo.length > 96) {
            elementos.bytesInfo.appendChild(criarElemento("span", ["byte-chip", "byte-chip-muted"], "..."));
        }
    }

    function renderizarEntidades() {
        const entidades = EntidadeStorage.listar();
        elementos.listaEntidades.innerHTML = "";

        if (entidades.length === 0) {
            const vazio = criarElemento("li", ["entity-empty"], "Nenhuma entidade cadastrada.");
            elementos.listaEntidades.appendChild(vazio);
            return;
        }

        entidades.forEach((entidade) => {
            const metricas = entidade.obterMetricas();
            const card = criarElemento("li", ["entity-card"]);
            card.dataset.id = entidade.id;

            const conteudo = criarElemento("div");
            const cabecalho = criarElemento("div", ["header-entity-card"]);
            const titulo = criarElemento("h2", [], entidade.nome);
            cabecalho.appendChild(titulo);

            const resumo = criarElemento("div", ["content-entity-card"]);
            resumo.append(
                criarElemento("span", ["content-entity-card-1"], `${metricas.quantidadeRegistros} registros`),
                criarElemento("span", ["content-entity-card-2"], formatarBytes(metricas.tamanhoVetor))
            );

            const atributos = criarElemento("div", ["entity-attributes"]);
            atributos.textContent = entidade.atributos.map((atributo) => `${atributo.nome}:${atributo.tipo}`).join(" | ");

            conteudo.append(cabecalho, resumo, atributos);

            const acoes = criarElemento("div", ["entity-actions"]);
            const info = criarElemento("button", ["default-btn", "entity-info"], "Mais informacoes");
            info.type = "button";
            info.dataset.action = "info";

            const excluir = criarElemento("button", ["default-btn", "entity-remove"], "Excluir");
            excluir.type = "button";
            excluir.dataset.action = "remove";

            acoes.append(info, excluir);
            card.append(conteudo, acoes);
            elementos.listaEntidades.appendChild(card);
        });
    }

    function tratarCliqueLista(evento) {
        const botao = evento.target.closest("button[data-action]");
        if (!botao) return;

        const card = botao.closest(".entity-card");
        const entidade = EntidadeStorage.buscarPorId(card.dataset.id);
        if (!entidade) return;

        if (botao.dataset.action === "info") {
            abrirModalInfo(entidade);
            return;
        }

        if (botao.dataset.action === "remove") {
            EntidadeStorage.remover(entidade.id);
            renderizarEntidades();
            mostrarToast(`Entidade ${entidade.nome} removida.`, "danger");
        }
    }

    function registrarEventos() {
        elementos.abrirModal.addEventListener("click", abrirModalCriacao);
        elementos.fecharModal.addEventListener("click", fecharModalCriacao);
        elementos.fecharModalInfo.addEventListener("click", fecharModalInfo);
        elementos.modalCriacao.addEventListener("click", (evento) => {
            if (evento.target === elementos.modalCriacao) fecharModalCriacao();
        });
        elementos.modalInfo.addEventListener("click", (evento) => {
            if (evento.target === elementos.modalInfo) fecharModalInfo();
        });
        elementos.adicionarAtributo.addEventListener("click", adicionarAtributo);
        elementos.nomeAtributo.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter") adicionarAtributo();
        });
        elementos.nomeEntidade.addEventListener("input", () => {
            limparErroCampo(elementos.nomeEntidade, elementos.erroNomeEntidade);
        });
        elementos.nomeAtributo.addEventListener("input", () => {
            limparErroCampo(elementos.nomeAtributo, elementos.erroNomeAtributo);
        });
        elementos.salvarEntidade.addEventListener("click", salvarEntidade);
        elementos.listaAtributos.addEventListener("click", (evento) => {
            const botao = evento.target.closest(".attribute-delete");
            if (!botao) return;

            estado.atributosTemporarios.splice(Number(botao.dataset.index), 1);
            renderizarAtributos();
            setMensagemFormulario("Atributo removido.", "success");
        });
        elementos.listaEntidades.addEventListener("click", tratarCliqueLista);
        document.addEventListener("keydown", (evento) => {
            if (evento.key !== "Escape") return;
            if (elementos.modalInfo.getAttribute("aria-hidden") === "false") fecharModalInfo();
            if (elementos.modalCriacao.getAttribute("aria-hidden") === "false") fecharModalCriacao();
        });
    }

    registrarEventos();
    fecharModalCriacao();
    fecharModalInfo();
    renderizarEntidades();
})();
