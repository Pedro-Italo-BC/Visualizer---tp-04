const ENTITY_STORAGE_KEY = "visualizer.entidades.v1";
const FILE_STORAGE_PREFIX = "visualizer.entidade.arquivo.";
const CRUD_ACTION_LABELS = {
  create: "CREATE",
  read: "READ",
  update: "UPDATE",
  delete: "DELETE"
};

const estadoCrud = {
  abaAtual: "decodificador",
  entidades: [],
  entidadeSelecionadaId: "",
  acaoAtual: "",
  registrosFormulario: [],
  bytesAtuais: []
};

const hexHeader = document.getElementById("hex-header");
const hexRows = document.getElementById("hex-rows");
const hexOffsets = document.getElementById("hex-offsets");
const hexEntityName = document.getElementById("hex-entity-name");
const hexFileKey = document.getElementById("hex-file-key");
const hexByteCount = document.getElementById("hex-byte-count");

function normalizarByte(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return ((Math.trunc(numero) % 256) + 256) % 256;
}

function toHex(byte) {
  return normalizarByte(byte).toString(16).toUpperCase().padStart(2, "0");
}

function criarChaveArquivo(entidade) {
  if (!entidade) return "";
  return entidade.arquivoKey || `${FILE_STORAGE_PREFIX}${entidade.id}`;
}

function carregarVetorBytes(entidade) {
  const chave = criarChaveArquivo(entidade);
  if (!chave) return [];

  const bruto = localStorage.getItem(chave);
  if (!bruto) return [];

  try {
    const vetor = JSON.parse(bruto);
    return Array.isArray(vetor) ? vetor.map(normalizarByte) : [];
  } catch (erro) {
    console.warn("Nao foi possivel carregar o vetor de bytes da entidade.", erro);
    return [];
  }
}

function renderizarCabecalhoHex() {
  hexHeader.innerHTML = "";

  for (let i = 0; i < 16; i++) {
    const coluna = document.createElement("span");
    coluna.className = "hex-column-label";
    coluna.textContent = toHex(i);
    hexHeader.appendChild(coluna);
  }
}

function renderizarRegistros() {

    const entidade = obterEntidadeSelecionada();

    console.log("ENTIDADE:", entidade);

    decoderContent.innerHTML = "";

    if (!entidade) {
        decoderContent.innerHTML =
            "<p>Nenhuma entidade selecionada.</p>";
        return;
    }

    const registros = ReadArquivo.read(entidade.id);

    console.log("REGISTROS:", registros);

    if (!registros || registros.length === 0) {
        decoderContent.innerHTML =
            "<p>Nenhum registro encontrado.</p>";
        return;
    }

    registros.forEach(registro => {

        const div = document.createElement("div");

        div.innerHTML = `
            <h3>ID ${registro.id}</h3>
            <pre>${JSON.stringify(registro, null, 2)}</pre>
        `;

        decoderContent.appendChild(div);
    });
}

function criarOffsetHex(valor) {
  const offset = document.createElement("div");
  offset.className = "hex-offset";
  offset.textContent = valor.toString(16).toUpperCase().padStart(8, "0");
  return offset;
}

function sincronizarOffsetsHex() {
  const spacer = hexOffsets.querySelector(".hex-offset-spacer");
  const headerStyle = window.getComputedStyle(hexHeader);
  spacer.style.height = `${hexHeader.offsetHeight + parseFloat(headerStyle.marginBottom || 0)}px`;

  const linhas = Array.from(hexRows.children);
  const offsets = Array.from(hexOffsets.querySelectorAll(".hex-offset"));

  linhas.forEach((linha, index) => {
    const offset = offsets[index];
    if (!offset) return;

    const linhaStyle = window.getComputedStyle(linha);
    offset.style.height = `${linha.offsetHeight}px`;
    offset.style.marginBottom = linhaStyle.marginBottom;
  });
}

function renderizarHexView(bytes, entidade = null) {
  const vetor = Array.isArray(bytes) ? bytes.map(normalizarByte) : [];
  estadoCrud.bytesAtuais = vetor;

  hexOffsets.innerHTML = "";
  hexRows.innerHTML = "";
  renderizarCabecalhoHex();

  hexEntityName.textContent = entidade ? entidade.nome : "Nenhuma entidade selecionada";
  hexFileKey.textContent = entidade ? criarChaveArquivo(entidade) : "-";
  hexByteCount.textContent = String(vetor.length);

  const spacer = document.createElement("div");
  spacer.className = "hex-offset-spacer";
  hexOffsets.appendChild(spacer);

  if (vetor.length === 0) {
    hexOffsets.appendChild(criarOffsetHex(0));

    const empty = document.createElement("div");
    empty.className = "hex-empty-row";
    empty.textContent = entidade
      ? "Nenhum byte registrado para esta entidade."
      : "Selecione uma entidade na aba Entidades para visualizar o arquivo.";
    hexRows.appendChild(empty);
    sincronizarOffsetsHex();
    return;
  }

  const bytesPorLinha = 16;
  const rowCount = Math.ceil(vetor.length / bytesPorLinha);
  for (let r = 0; r < rowCount; r++) {
    const enderecoInicial = r * bytesPorLinha;
    hexOffsets.appendChild(criarOffsetHex(enderecoInicial));

    const rowDiv = document.createElement("div");
    rowDiv.className = "hex-data-row";

    for (let c = 0; c < bytesPorLinha; c++) {
      const idx = r * bytesPorLinha + c;
      const byte = document.createElement("span");
      byte.className = "hex-byte";
      byte.textContent = idx < vetor.length ? toHex(vetor[idx]) : "";
      if (idx >= vetor.length) byte.classList.add("hex-byte-empty");
      rowDiv.appendChild(byte);
    }

    hexRows.appendChild(rowDiv);
  }

  sincronizarOffsetsHex();
}

function atualizarDadosArquivoSelecionado() {
  const entidade = obterEntidadeSelecionada();
  const bytes = carregarVetorBytes(entidade);
  renderizarHexView(bytes, entidade);
}

const decoderContent = document.getElementById("decoder-content");
const crudModal = document.getElementById("crud-modal");
const closeCrudModal = document.getElementById("close-crud-modal");
const crudModalTitle = document.getElementById("crud-modal-title");
const crudModalSubtitle = document.getElementById("crud-modal-subtitle");
const crudForm = document.getElementById("crud-form");
const crudFormMessage = document.getElementById("crud-form-message");
const collectCrudData = document.getElementById("collect-crud-data");
const toastStack = document.getElementById("toast-stack");

function criarElemento(tag, classes = [], texto = "") {
  const elemento = document.createElement(tag);
  classes.forEach((classe) => elemento.classList.add(classe));
  if (texto) elemento.textContent = texto;
  return elemento;
}

function normalizarAtributos(atributos) {
  return (Array.isArray(atributos) ? atributos : [])
    .map((atributo) => ({
      nome: String(atributo.nome || "").trim(),
      tipo: atributo.tipo || "String"
    }))
    .filter((atributo) => atributo.nome);
}

function carregarEntidadesLocalStorage() {
  const bruto = localStorage.getItem(ENTITY_STORAGE_KEY);
  if (!bruto) return [];

  try {
    const banco = JSON.parse(bruto);
    const entidades = Array.isArray(banco.entidades) ? banco.entidades : [];
    return entidades.map((entidade) => ({
      id: entidade.id,
      nome: entidade.nome || "Entidade sem nome",
      arquivoKey: entidade.arquivoKey,
      atributos: normalizarAtributos(entidade.lista_attr || entidade.atributos),
      registros: Array.isArray(entidade.registros) ? entidade.registros : []
    })).filter((entidade) => entidade.id);
  } catch (erro) {
    console.warn("Nao foi possivel carregar entidades do localStorage.", erro);
    return [];
  }
}

function obterEntidadeSelecionada() {
  return estadoCrud.entidades.find((entidade) => entidade.id === estadoCrud.entidadeSelecionadaId) || null;
}

function setMensagemFormulario(texto, tipo = "error") {
  crudFormMessage.textContent = texto;
  crudFormMessage.dataset.type = tipo;
  crudFormMessage.classList.toggle("is-visible", Boolean(texto));
}

function mostrarToast(texto, tipo = "success") {
  if (!toastStack) return;

  const toast = criarElemento("div", ["toast", `toast-${tipo}`], texto);
  toastStack.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("toast-hide");
    window.setTimeout(() => toast.remove(), 180);
  }, 2600);
}

function renderDecoder() {
  if (estadoCrud.bytesAtuais.length === 0) {
    decoderContent.textContent = "Selecione uma entidade para visualizar o fluxo hexadecimal.";
    return;
  }

  decoderContent.textContent = estadoCrud.bytesAtuais.map(toHex).join(" ");
}

function formatarResumoAtributos(entidade) {
  if (entidade.atributos.length === 0) return "Sem atributos cadastrados";
  return entidade.atributos.map((atributo) => `${atributo.nome}:${atributo.tipo}`).join(" | ");
}

function renderizarEntidadesDecoder() {
  estadoCrud.entidades = carregarEntidadesLocalStorage();
  decoderContent.innerHTML = "";
  decoderContent.classList.add("entities-decoder");

  if (estadoCrud.entidades.length === 0) {
    const vazio = criarElemento("div", ["entity-empty"], "Nenhuma entidade cadastrada.");
    decoderContent.appendChild(vazio);
    estadoCrud.entidadeSelecionadaId = "";
    return;
  }

  const lista = criarElemento("ul", ["decoder-entity-list"]);

  estadoCrud.entidades.forEach((entidade) => {
    const item = criarElemento("li", ["decoder-entity-card"]);
    if (entidade.id === estadoCrud.entidadeSelecionadaId) item.classList.add("is-selected");
    item.dataset.id = entidade.id;

    const titulo = criarElemento("h3", [], entidade.nome);
    const meta = criarElemento("div", ["decoder-entity-meta"], `${entidade.atributos.length} atributos | ${entidade.registros.length} registros`);
    const atributos = criarElemento("p", ["decoder-entity-attributes"], formatarResumoAtributos(entidade));

    item.append(titulo, meta, atributos);
    lista.appendChild(item);
  });

  decoderContent.appendChild(lista);
}

function abrirModalCrud(acao) {
  estadoCrud.entidades = carregarEntidadesLocalStorage();
  const entidade = obterEntidadeSelecionada();

  if (!entidade) {
    mostrarToast("Selecione uma entidade na aba Entidades antes de usar o CRUD.", "danger");
    if (estadoCrud.abaAtual !== "entidades") {
      const tabEntidades = document.querySelector('.decoder-tab[data-tab="entidades"]');
      if (tabEntidades) tabEntidades.click();
    }
    return;
  }

  estadoCrud.acaoAtual = acao;
  crudModalTitle.textContent = `${CRUD_ACTION_LABELS[acao]} ${entidade.nome}`;
  crudModalSubtitle.textContent = "Campos gerados a partir dos metadados da entidade.";
  crudForm.innerHTML = "";
  setMensagemFormulario("");

  if (entidade.atributos.length === 0) {
    crudForm.appendChild(criarElemento("div", ["entity-empty"], "Esta entidade nao possui atributos cadastrados."));
  } else {
    entidade.atributos.forEach((atributo, index) => {
      crudForm.appendChild(criarCampoCrud(atributo, index));
    });
  }

  crudModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  const primeiroCampo = crudForm.querySelector("input, select");
  if (primeiroCampo) primeiroCampo.focus();
}

function fecharModalCrud() {
  crudModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function criarCampoCrud(atributo, index) {
  const grupo = criarElemento("div", ["form-group", "crud-field"]);
  const label = criarElemento("label", [], atributo.nome);
  const inputId = `crud-field-${index}`;
  label.setAttribute("for", inputId);

  const input = atributo.tipo === "Boolean"
    ? criarSelectBooleano(inputId)
    : document.createElement("input");

  input.id = inputId;
  input.name = atributo.nome;
  input.dataset.index = String(index);
  input.dataset.nome = atributo.nome;
  input.dataset.tipo = atributo.tipo;

  if (atributo.tipo !== "Boolean") {
    input.className = "modal-input";
    input.type = obterTipoInput(atributo.tipo);
    input.placeholder = obterPlaceholder(atributo);
    if (atributo.tipo === "Float") input.step = "any";
  }

  const detalhe = criarElemento("span", ["crud-field-type"], atributo.tipo);
  grupo.append(label, input, detalhe);
  return grupo;
}

function criarSelectBooleano(inputId) {
  const select = document.createElement("select");
  select.id = inputId;
  select.className = "modal-input";

  const opcaoFalse = document.createElement("option");
  opcaoFalse.value = "false";
  opcaoFalse.textContent = "false";

  const opcaoTrue = document.createElement("option");
  opcaoTrue.value = "true";
  opcaoTrue.textContent = "true";

  select.append(opcaoFalse, opcaoTrue);
  return select;
}

function obterTipoInput(tipo) {
  if (tipo === "Integer" || tipo === "Float") return "number";
  return "text";
}

function obterPlaceholder(atributo) {
  if (atributo.tipo === "Integer") return "Digite um numero inteiro";
  if (atributo.tipo === "Float") return "Digite um numero decimal";
  return `Digite ${atributo.nome}`;
}

function converterValor(tipo, valor) {
  if (tipo === "Boolean") return valor === "true";
  if (tipo === "Integer") return valor === "" ? null : Number.parseInt(valor, 10);
  if (tipo === "Float") return valor === "" ? null : Number.parseFloat(valor);
  return valor;
}

function obterDadosFormularioCrud() {
  const entidade = obterEntidadeSelecionada();
  if (!entidade) return [];

  return entidade.atributos.map((atributo, index) => {
    const campo = crudForm.querySelector(`[data-index="${index}"]`);
    return {
      nome: atributo.nome,
      tipo: atributo.tipo,
      valor: converterValor(atributo.tipo, campo ? campo.value : "")
    };
  });
}

function coletarDadosCrud() {
  const entidade = obterEntidadeSelecionada();
  if (!entidade) return;

  const valoresOrdenados = obterDadosFormularioCrud();

  const registro = {
    acao: estadoCrud.acaoAtual,
    entidadeId: entidade.id,
    entidadeNome: entidade.nome,
    valores: valoresOrdenados,
    criadoEm: new Date().toISOString()
  };

  estadoCrud.registrosFormulario.push(registro);

  console.log("Registro CRUD coletado:", registro);

  const idCriado = CreateArquivo.create(
    entidade.id,
    registro.valores
  );

  console.log("ID criado:", idCriado);

  console.log(
      localStorage.getItem(entidade.id)
  );

  console.log(
    localStorage.getItem(entidade.id)
  );

  setMensagemFormulario(
    "Dados coletados e salvos.",
    "success"
  );

  mostrarToast(`Registro ${idCriado} criado.`);
}

window.VisualizerCrud = {
  obterDadosFormularioCrud,
  obterRegistrosColetados: () => [...estadoCrud.registrosFormulario]
};

renderizarHexView([]);
renderDecoder();

document.querySelectorAll(".decoder-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".decoder-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    estadoCrud.abaAtual = tab.dataset.tab;

      switch (tab.dataset.tab) {

      case "entidades":
        renderizarEntidadesDecoder();
        break;

      case "registros":
        renderizarRegistros();
        break;

      default:
        decoderContent.classList.remove("entities-decoder");
        renderDecoder();
        break;
    }
  });
});

decoderContent.addEventListener("click", (evento) => {
  const card = evento.target.closest(".decoder-entity-card");
  if (!card) return;

  estadoCrud.entidadeSelecionadaId = card.dataset.id;
  atualizarDadosArquivoSelecionado();
  renderizarEntidadesDecoder();
  if (estadoCrud.abaAtual === "decodificador") {
    renderDecoder();
  }

  if (estadoCrud.abaAtual === "registros") {
      renderizarRegistros();
  }
});

document.querySelectorAll(".crud-btn[data-crud-action]").forEach((botao) => {
  botao.addEventListener("click", () => abrirModalCrud(botao.dataset.crudAction));
});

closeCrudModal.addEventListener("click", fecharModalCrud);
crudModal.addEventListener("click", (evento) => {
  if (evento.target === crudModal) fecharModalCrud();
});
collectCrudData.addEventListener("click", coletarDadosCrud);

document.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape" && crudModal.getAttribute("aria-hidden") === "false") {
    fecharModalCrud();
  }
});

window.addEventListener("resize", sincronizarOffsetsHex);