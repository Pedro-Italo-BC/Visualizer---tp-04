// ---- Sample data (placeholder until wired to a real file) ----
const fileBytes = [0x00, 0x00, 0x00, 0x00];

function toHex(byte) {
  return byte.toString(16).toUpperCase().padStart(2, "0");
}

// Header row: 00 01 02 ... 0F
const header = document.getElementById("hex-header");
let headerLine = "";
for (let i = 0; i < 16; i++) headerLine += toHex(i) + " ";
header.textContent = headerLine.trim();

// Body rows + offsets, 16 bytes per row
const rowsEl = document.getElementById("hex-rows");
const offsetsEl = document.getElementById("hex-offsets");

// Spacer to align gutter with header row in hex-body
const spacer = document.createElement("div");
spacer.style.height = "22px";
offsetsEl.appendChild(spacer);

const rowCount = Math.max(1, Math.ceil(fileBytes.length / 16));
for (let r = 0; r < rowCount; r++) {
  const offsetDiv = document.createElement("div");
  offsetDiv.className = "hex-offset";
  offsetDiv.textContent = (r * 16).toString(16).toUpperCase().padStart(8, "0");
  offsetsEl.appendChild(offsetDiv);

  const rowDiv = document.createElement("div");
  rowDiv.className = "hex-data-row";
  let rowHtml = "";
  for (let c = 0; c < 16; c++) {
    const idx = r * 16 + c;
    if (idx < fileBytes.length) {
      rowHtml += `<span class="hex-byte">${toHex(fileBytes[idx])}</span> `;
    } else {
      rowHtml += `<span class="hex-byte"> </span> `;
    }
  }
  rowDiv.innerHTML = rowHtml;
  rowsEl.appendChild(rowDiv);
}

// Decoder content: shows the same bytes as a flat hex stream
const decoderContent = document.getElementById("decoder-content");
function renderDecoder() {
  decoderContent.textContent = fileBytes.map(toHex).join(" ");
}
renderDecoder();

// Tab switching (placeholder behavior)
document.querySelectorAll(".decoder-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".decoder-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    if (tab.dataset.tab === "entidades") {
      decoderContent.textContent = "Nenhuma entidade detectada ainda.";
    } else {
      renderDecoder();
    }
  });
});
