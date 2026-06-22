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
  registroSelecionadoId: null,
  interacao: {
    hover: null,
    selected: null
  },
  registrosFormulario: [],
  bytesAtuais: []
};

const hexHeader = document.getElementById("hex-header");
const hexRows = document.getElementById("hex-rows");
const hexOffsets = document.getElementById("hex-offsets");
const hexEntityName = document.getElementById("hex-entity-name");
const hexFileKey = document.getElementById("hex-file-key");
const hexByteCount = document.getElementById("hex-byte-count");
const selectionInfo = document.getElementById("selection-info");

function normalizarByte(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return ((Math.trunc(numero) % 256) + 256) % 256;
}

function toHex(byte) {
  return normalizarByte(byte).toString(16).toUpperCase().padStart(2, "0");
}

function paraInt8(vetor) {
  return new Int8Array((vetor || []).map(normalizarByte));
}

function lerIntArquivo(vetor, offset) {
  if (!Array.isArray(vetor) || offset + 4 > vetor.length) return 0;
  return ByteStream.readInt(paraInt8(vetor), offset);
}

function lerShortArquivo(vetor, offset) {
  if (!Array.isArray(vetor) || offset + 2 > vetor.length) return 0;
  return ByteStream.readShort(paraInt8(vetor), offset);
}

function lerLongArquivo(vetor, offset) {
  if (!Array.isArray(vetor) || offset + 8 > vetor.length) return -1;
  return Number(ByteStream.readLong(paraInt8(vetor), offset));
}

function obterRegistroPorEndereco(entidade, endereco) {
  if (!entidade || !Array.isArray(entidade.registros)) return null;
  return entidade.registros.find((registro) => Number(registro.endereco) === Number(endereco)) || null;
}

function obterRegistroPorId(entidade, id) {
  if (!entidade || !Array.isArray(entidade.registros)) return null;
  return entidade.registros.find((registro) => Number(registro.id) === Number(id)) || null;
}

function analisarArquivoAtual() {
  const entidade = obterEntidadeSelecionada();
  const bytes = estadoCrud.bytesAtuais;
  const slots = [];
  let endereco = 12;

  while (Array.isArray(bytes) && endereco + 3 <= bytes.length) {
    const tamanho = lerShortArquivo(bytes, endereco + 1);
    const fim = endereco + 2 + tamanho;
    if (tamanho < 0 || fim >= bytes.length) break;

    const registro = obterRegistroPorEndereco(entidade, endereco);
    slots.push({
      tipo: bytes[endereco] === 42 ? "registro-deletado" : "registro",
      id: registro ? registro.id : null,
      ativo: registro ? registro.ativo : bytes[endereco] !== 42,
      endereco,
      inicio: endereco,
      fim,
      tamanho,
      lapide: bytes[endereco],
      registro
    });

    endereco = fim + 1;
  }

  return {
    entidade,
    bytes,
    ultimoId: bytes.length >= 4 ? lerIntArquivo(bytes, 0) : 0,
    ponteiroLapides: bytes.length >= 12 ? lerLongArquivo(bytes, 4) : -1,
    slots,
    deletados: slots.filter((slot) => slot.tipo === "registro-deletado")
  };
}

function criarRangeCabecalho(tipo) {
  const analise = analisarArquivoAtual();
  if (tipo === "ultimo-id") {
    return {
      tipo,
      inicio: 0,
      fim: 3,
      titulo: "Ultimo ID",
      detalhe: `Ultimo ID usado: ${analise.ultimoId}`
    };
  }

  return {
    tipo: "ponteiro-lapides",
    inicio: 4,
    fim: 11,
    incluirDeletados: true,
    titulo: "Ponteiro de lapides",
    detalhe: analise.ponteiroLapides === -1
      ? "Lista de lapides vazia."
      : `Primeira lapide no endereco 0x${analise.ponteiroLapides.toString(16).toUpperCase().padStart(8, "0")}.`
  };
}

function criarRangeRegistro(slot) {
  const id = slot.id === null ? "sem metadado" : slot.id;
  return {
    tipo: slot.tipo,
    id: slot.id,
    inicio: slot.inicio,
    fim: slot.fim,
    titulo: slot.tipo === "registro-deletado" ? "Registro deletado" : "Registro",
    detalhe: `ID ${id} | endereco 0x${slot.endereco.toString(16).toUpperCase().padStart(8, "0")} | tamanho ${slot.tamanho} bytes`
  };
}

function obterRangePorByte(index) {
  const analise = analisarArquivoAtual();
  if (index >= 0 && index <= 3) return criarRangeCabecalho("ultimo-id");
  if (index >= 4 && index <= 11) return criarRangeCabecalho("ponteiro-lapides");

  const slot = analise.slots.find((item) => index >= item.inicio && index <= item.fim);
  if (!slot) {
    return {
      tipo: "byte",
      inicio: index,
      fim: index,
      titulo: "Byte",
      detalhe: `Endereco 0x${index.toString(16).toUpperCase().padStart(8, "0")} | ASCII ${formatarAscii(estadoCrud.bytesAtuais[index])}`
    };
  }

  if (index === slot.inicio) {
    return {
      ...criarRangeRegistro(slot),
      titulo: "Lapide",
      detalhe: `${slot.tipo === "registro-deletado" ? "Registro deletado" : "Registro ativo"} | byte '${formatarAscii(slot.lapide)}'`
    };
  }

  return criarRangeRegistro(slot);
}

function obterRangePorRegistro(registroId) {
  const analise = analisarArquivoAtual();
  const slot = analise.slots.find((item) => Number(item.id) === Number(registroId));
  if (slot) return criarRangeRegistro(slot);

  const entidade = obterEntidadeSelecionada();
  const registro = obterRegistroPorId(entidade, registroId);
  if (!registro) return null;

  return {
    tipo: registro.ativo ? "registro" : "registro-deletado",
    id: registro.id,
    inicio: Number(registro.endereco),
    fim: Number(registro.endereco),
    titulo: registro.ativo ? "Registro" : "Registro deletado",
    detalhe: `ID ${registro.id}`
  };
}

function indicesDoRange(range) {
  if (!range) return [];

  const indices = [];
  for (let i = range.inicio; i <= range.fim; i++) {
    indices.push(i);
  }

  if (range.incluirDeletados) {
    analisarArquivoAtual().deletados.forEach((slot) => {
      for (let i = slot.inicio; i <= slot.fim; i++) {
        indices.push(i);
      }
    });
  }

  return indices;
}

function descreverRange(range) {
  if (!range) return "Passe o cursor por um byte ou registro para ver detalhes.";

  const analise = analisarArquivoAtual();
  const ascii = range.inicio === range.fim
    ? ` | ASCII: ${formatarAscii(estadoCrud.bytesAtuais[range.inicio])}`
    : "";
  const deletados = range.incluirDeletados
    ? ` | lapides encontradas: ${analise.deletados.length}`
    : "";

  return `${range.titulo}: ${range.detalhe}${ascii}${deletados}`;
}

function atualizarPainelSelecao(range) {
  if (!selectionInfo) return;
  selectionInfo.textContent = descreverRange(range || estadoCrud.interacao.selected);
}

function limparClassesInteracao() {
  document.querySelectorAll(".byte-hover, .byte-selected, .record-hover, .record-selected").forEach((elemento) => {
    elemento.classList.remove("byte-hover", "byte-selected", "record-hover", "record-selected");
  });
}

function marcarRange(range, classeByte, classeRegistro) {
  if (!range) return;

  indicesDoRange(range).forEach((index) => {
    document.querySelectorAll(`[data-byte-index="${index}"]`).forEach((elemento) => {
      elemento.classList.add(classeByte);
    });
  });

  if (range.id !== null && range.id !== undefined) {
    document.querySelectorAll(`[data-record-id="${range.id}"]`).forEach((elemento) => {
      elemento.classList.add(classeRegistro);
    });
  }
}

function aplicarInteracao() {
  limparClassesInteracao();
  marcarRange(estadoCrud.interacao.hover, "byte-hover", "record-hover");
  marcarRange(estadoCrud.interacao.selected, "byte-selected", "record-selected");
  atualizarPainelSelecao(estadoCrud.interacao.hover || estadoCrud.interacao.selected);
}

function definirHover(range) {
  estadoCrud.interacao.hover = range;
  aplicarInteracao();
}

function definirSelecao(range) {
  estadoCrud.interacao.selected = range;
  aplicarInteracao();
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

    decoderContent.innerHTML = "";
    decoderContent.classList.remove("entities-decoder");
    decoderContent.classList.add("records-decoder");

    if (!entidade) {
        decoderContent.innerHTML = "<p>Nenhuma entidade selecionada.</p>";
        return;
    }

    const registros = ReadArquivo.read(entidade.id);

    if (!registros || registros.length === 0) {
        decoderContent.innerHTML = "<p>Nenhum registro encontrado.</p>";
        return;
    }

    const registrosAtivos = registros.filter(r => r.ativo);

    if (registrosAtivos.length === 0) {
        decoderContent.innerHTML = "<p>Nenhum registro ativo encontrado.</p>";
        return;
    }

    registrosAtivos.forEach(registro => {

        const div = document.createElement("div");
        div.className = "registro-card";
        div.dataset.id = String(registro.id);

        div.innerHTML = `
            <div class="registro-main">
                <div class="registro-header">
                    <strong>ID ${registro.id}</strong>
                    <span class="status ativo">Ativo</span>
                </div>
                <div class="registro-valores">
                    ${Object.entries(registro.valores)
                        .map(([k, v]) => `<div><b>${k}</b>: ${v}</div>`)
                        .join("")}
                </div>

                <div class="registro-info">
                    <div><b>Criado:</b> ${new Date(registro.criadoEm).toLocaleString()}</div>
                    <div><b>Atualizado:</b> ${new Date(registro.atualizadoEm).toLocaleString()}</div>
                </div>
            </div>
            <div class="registro-actions">
                <button class="registro-action edit" type="button" data-record-action="edit" data-id="${registro.id}">Editar</button>
                <button class="registro-action delete" type="button" data-record-action="delete" data-id="${registro.id}">Deletar</button>
            </div>
        `;

        decoderContent.appendChild(div);
    });
}

function renderRegistro(registro) {
  return `
    <div class="registro-card">
      <div class="registro-header">
        <strong>ID ${registro.id}</strong>
        <span class="status ${registro.ativo ? "ativo" : "inativo"}">
          ${registro.ativo ? "Ativo" : "Inativo"}
        </span>
      </div>

      <div class="registro-body">
        <div><b>Criado em:</b> ${new Date(registro.criadoEm).toLocaleString()}</div>
        <div><b>Atualizado em:</b> ${new Date(registro.atualizadoEm).toLocaleString()}</div>
      </div>

      <div class="registro-valores">
        <b>Valores:</b>
        <ul>
          ${Object.entries(registro.valores)
            .map(([chave, valor]) => `<li><b>${chave}</b>: ${valor}</li>`)
            .join("")}
        </ul>
      </div>
    </div>
  `;
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
    aplicarInteracao();
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
      if (idx < vetor.length) {
        byte.dataset.byteIndex = String(idx);
        byte.title = `ASCII: ${formatarAscii(vetor[idx])}`;
      } else {
        byte.classList.add("hex-byte-empty");
      }
      rowDiv.appendChild(byte);
    }

    hexRows.appendChild(rowDiv);
  }

  sincronizarOffsetsHex();
  aplicarInteracao();
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
    decoderContent.classList.remove("entities-decoder", "records-decoder");
    decoderContent.textContent = "Selecione uma entidade para visualizar a grade ASCII.";
    return;
  }

  decoderContent.innerHTML = "";
  decoderContent.classList.remove("entities-decoder", "records-decoder");

  const asciiView = document.createElement("div");
  asciiView.className = "ascii-view";

  const gutter = document.createElement("div");
  gutter.className = "ascii-gutter";

  const gutterSpacer = document.createElement("div");
  gutterSpacer.className = "ascii-offset-spacer";
  gutter.appendChild(gutterSpacer);

  const body = document.createElement("div");
  body.className = "ascii-body";

  const header = document.createElement("div");
  header.className = "ascii-header-row";

  for (let i = 0; i < 16; i++) {
    const coluna = document.createElement("span");
    coluna.className = "ascii-column-label";
    coluna.textContent = toHex(i);
    header.appendChild(coluna);
  }

  body.appendChild(header);

  const bytesPorLinha = 16;
  const rowCount = Math.ceil(estadoCrud.bytesAtuais.length / bytesPorLinha);

  for (let r = 0; r < rowCount; r++) {
    const enderecoInicial = r * bytesPorLinha;
    const offset = document.createElement("div");
    offset.className = "ascii-offset";
    offset.textContent = enderecoInicial.toString(16).toUpperCase().padStart(8, "0");
    gutter.appendChild(offset);

    const row = document.createElement("div");
    row.className = "ascii-data-row";

    for (let c = 0; c < bytesPorLinha; c++) {
      const idx = r * bytesPorLinha + c;
      const cell = document.createElement("span");
      cell.className = "ascii-byte";
      cell.textContent = idx < estadoCrud.bytesAtuais.length ? formatarAscii(estadoCrud.bytesAtuais[idx]) : "";
      if (idx >= estadoCrud.bytesAtuais.length) cell.classList.add("ascii-byte-empty");
      row.appendChild(cell);
    }

    body.appendChild(row);
  }

  asciiView.append(gutter, body);
  decoderContent.appendChild(asciiView);
}

function formatarAscii(byte) {
  const valor = normalizarByte(byte);
  if (valor === 0) return "NUL";
  if (valor === 9) return "TAB";
  if (valor === 10) return "LF";
  if (valor === 13) return "CR";
  if (valor === 32) return "SP";
  if (valor < 32 || valor === 127) return ".";
  return String.fromCharCode(valor);
}

function formatarResumoAtributos(entidade) {
  if (entidade.atributos.length === 0) return "Sem atributos cadastrados";
  return entidade.atributos.map((atributo) => `${atributo.nome}:${atributo.tipo}`).join(" | ");
}

function renderizarEntidadesDecoder() {
  estadoCrud.entidades = carregarEntidadesLocalStorage();
  decoderContent.innerHTML = "";
  decoderContent.classList.remove("records-decoder");
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

function abrirModalCrud(acao, registroId = null) {
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
  estadoCrud.registroSelecionadoId = registroId;
  crudModalTitle.textContent = `${CRUD_ACTION_LABELS[acao]} ${entidade.nome}`;
  crudModalSubtitle.textContent = acao === "create"
    ? "Campos gerados a partir dos metadados da entidade."
    : `Editando registro ${registroId}.`;
  crudForm.innerHTML = "";
  setMensagemFormulario("");
  collectCrudData.textContent = acao === "create" ? "Obter dados" : "Salvar alteracoes";

  if (acao !== "create" && !registroId) {
    crudForm.appendChild(criarCampoIdRegistro());
  }

  if (entidade.atributos.length === 0) {
    crudForm.appendChild(criarElemento("div", ["entity-empty"], "Esta entidade nao possui atributos cadastrados."));
  } else {
    entidade.atributos.forEach((atributo, index) => {
      crudForm.appendChild(criarCampoCrud(atributo, index));
    });
  }

  if (acao === "update" && registroId) {
    preencherFormularioRegistro(registroId);
  }

  crudModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  const primeiroCampo = crudForm.querySelector("input, select");
  if (primeiroCampo) primeiroCampo.focus();
}

function preencherFormularioRegistro(registroId) {
  const entidade = obterEntidadeSelecionada();
  const registro = entidade && (entidade.registros || []).find((item) => Number(item.id) === Number(registroId));
  if (!registro) return;

  entidade.atributos.forEach((atributo, index) => {
    const campo = crudForm.querySelector(`[data-index="${index}"]`);
    if (!campo) return;

    const valor = registro.valores ? registro.valores[atributo.nome] : "";
    campo.value = atributo.tipo === "Boolean" ? String(Boolean(valor)) : String(valor ?? "");
  });
}

function criarCampoIdRegistro() {
  const grupo = criarElemento("div", ["form-group", "crud-field"]);
  const label = criarElemento("label", [], "ID");
  const input = document.createElement("input");

  input.id = "crud-record-id";
  input.name = "id";
  input.className = "modal-input";
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.placeholder = "Digite o ID do registro";

  label.setAttribute("for", input.id);
  grupo.append(label, input, criarElemento("span", ["crud-field-type"], "Integer"));
  return grupo;
}

function fecharModalCrud() {
  crudModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  estadoCrud.registroSelecionadoId = null;
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

function obterIdFormularioCrud() {
  const campo = crudForm.querySelector("#crud-record-id");
  const id = campo ? Number.parseInt(campo.value, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

function atualizarTelaAposCrud() {
  estadoCrud.entidades = carregarEntidadesLocalStorage();
  atualizarDadosArquivoSelecionado();

  if (estadoCrud.abaAtual === "decodificador") {
    renderDecoder();
  }

  if (estadoCrud.abaAtual === "registros") {
    renderizarRegistros();
  }
}

function coletarDadosCrud() {
  const entidade = obterEntidadeSelecionada();
  if (!entidade) return;

  const valoresOrdenados = obterDadosFormularioCrud();
  const idRegistro = estadoCrud.registroSelecionadoId || obterIdFormularioCrud();

  const registro = {
    acao: estadoCrud.acaoAtual,
    entidadeId: entidade.id,
    entidadeNome: entidade.nome,
    valores: valoresOrdenados,
    criadoEm: new Date().toISOString()
  };

  estadoCrud.registrosFormulario.push(registro);

  console.log("Registro CRUD coletado:", registro);

  if (estadoCrud.acaoAtual === "create") {
    const idCriado = CreateArquivo.create(
      entidade.id,
      registro.valores
    );

    setMensagemFormulario("Registro criado.", "success");
    mostrarToast(`Registro ${idCriado} criado.`);
    atualizarTelaAposCrud();
    return;
  }

  if (!idRegistro) {
    setMensagemFormulario("Informe um ID valido.", "error");
    return;
  }

  if (estadoCrud.acaoAtual === "update") {
    const atualizado = UpdateArquivo.update(entidade.id, idRegistro, registro.valores);

    setMensagemFormulario(
      atualizado ? `Registro ${idRegistro} atualizado.` : `Registro ${idRegistro} nao encontrado.`,
      atualizado ? "success" : "error"
    );
    if (atualizado) mostrarToast(`Registro ${idRegistro} atualizado.`);
    atualizarTelaAposCrud();
    if (atualizado) fecharModalCrud();
  }
}

function deletarRegistro(registroId) {
  const entidade = obterEntidadeSelecionada();
  if (!entidade) return;

  const removido = DeleteArquivo.delete(entidade.id, registroId);
  if (removido) {
    mostrarToast(`Registro ${registroId} removido.`, "danger");
    atualizarTelaAposCrud();
  } else {
    mostrarToast(`Registro ${registroId} nao encontrado.`, "danger");
  }
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
        decoderContent.classList.remove("entities-decoder", "records-decoder");
        renderDecoder();
        break;
    }
  });
});

decoderContent.addEventListener("click", (evento) => {
  const acaoRegistro = evento.target.closest("[data-record-action]");
  if (acaoRegistro) {
    const id = Number.parseInt(acaoRegistro.dataset.id, 10);
    if (acaoRegistro.dataset.recordAction === "edit") abrirModalCrud("update", id);
    if (acaoRegistro.dataset.recordAction === "delete") deletarRegistro(id);
    return;
  }

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
