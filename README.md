# ⚡ NewtonAgent — AI Web Agent (Manifest V3)

NewtonAgent é uma extensão Chromium Manifest V3 de alta performance desenvolvida para atuar como agente autônomo de automação, testes web e resolução dinâmica de formulários e PWAs. Compatível nativamente tanto com **Google Chrome** quanto com o **Brave Browser**.

---

## 🌟 Principais Recursos e Diferenciais

- **Arquitetura 100% Manifest V3**: Totalmente alinhada com as diretrizes modernas do ecossistema Chromium.
- **Side Panel Nativo + Fallback Inteligente**: Interface lateral moderna acionável com um clique, com suporte ao Brave Browser (onde `chrome.sidePanel.setPanelBehavior` possui comportamentos distintos).
- **Resiliente ao Brave Shields**:
  - `Content Script` roda em **ISOLATED world**, sem interferência de bloqueios de scripts ou fingerprinting do Shields.
  - Todas as chamadas de rede à IA (LLMs) são disparadas **exclusivamente a partir do Background Service Worker**, imune a bloqueios de CSP, CORS e adblockers da página.
  - Fontes (Inter e JetBrains Mono) empacotadas localmente — zero requisições externas na interface.
- **BYOK (Bring Your Own Key)**:
  - Suporte nativo a endpoints compatíveis com **OpenAI / NVIDIA NIM** (como o modelo `nvidia/llama-3.1-nemotron-ultra-253b-v1` com suporte a raciocínio detalhado).
  - Suporte nativo à API do **Google Gemini** (`:generateContent`).
  - Suporte a endpoints locais (**Ollama**, LM Studio, vLLM).
- **Ciclo ReAct / Observe-Think-Act**:
  - **Observe**: Destilação inteligente da árvore DOM com busca em Shadow DOM aberto, conversão de custom radios/checkboxes em proxies clicáveis e serialização compacta (economia de ~65% dos tokens).
  - **Think**: Geração de raciocínio estruturado (`thought`) e plano de ação em JSON estrito.
  - **Act**: Disparo de cadeias reais de eventos nativos (`pointerover`, `pointerdown`, `mousedown`, `focus`, `pointerup`, `mouseup`, `click`). Para campos de texto, usa o setter nativo do protótipo (`HTMLInputElement.prototype.value`) garantindo compatibilidade com React, Next.js e Vue.
- **UI Semântica Estrita (Zero `<div>`)**: Todos os componentes utilizam tags HTML semânticas (`<main>`, `<section>`, `<article>`, `<header>`, `<footer>`, `<nav>`, `<aside>`, `<form>`, `<fieldset>`).
- **Design Visual Premium Cyber-Chrome**: Dark mode profundo em preto absoluto (`#060709`), acabamento em prata/platina e cromo metálico (`#ffffff` / `#cbd5e1` / `#94a3b8`), efeito glassmorphism e iluminação em cromo brilhante alinhada à nova identidade visual da marca.

---

## 📁 Estrutura de Diretórios

```
neuropilot-agent/
├── dist/                        # Build pronto para carregar no navegador
│   ├── manifest.json
│   ├── background.js
│   ├── content.js               # IIFE autônomo
│   ├── sidepanel.html
│   ├── icons/                   # Ícones NewtonAgent (16, 32, 48, 128, 512)
│   └── assets/
├── demo/
│   └── quiz.html                # Página de teste interativa (PWA/Form dinâmico)
├── public/
│   ├── manifest.json
│   └── icons/
├── scripts/
│   └── check-no-div.mjs         # Linter de verificação semântica estrita
├── src/
│   ├── shared/                  # Tipos, contratos e mensagens tipadas
│   ├── content/                 # Destilador DOM, executor de eventos e overlay
│   ├── background/              # Orquestrador, LLM clients, session e keep-alive
│   └── sidepanel/               # Interface React com zero <div>
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🚀 Como Instalar no Google Chrome e Brave Browser

### 1. Pré-requisitos e Build
O projeto já se encontra compilado na pasta `dist/`. Caso deseje recompilar:
```bash
npm run build
```
Para validar a regra estrita de zero `<div>`:
```bash
npm run lint:semantic
```

### 2. Carregar a Extensão no Navegador

#### No **Google Chrome**:
1. Abra o Chrome e acesse: `chrome://extensions`
2. No canto superior direito, ative a chave **Modo do desenvolvedor** (*Developer mode*).
3. Clique no botão **Carregar sem compactação** (*Load unpacked*).
4. Selecione a pasta `dist` deste projeto:
   `C:\Users\Pichau\.gemini\antigravity-ide\scratch\neuropilot-agent\dist`
5. Fixe o ícone do **NewtonAgent** na barra de ferramentas.

#### No **Brave Browser**:
1. Abra o Brave e acesse: `brave://extensions`
2. Ative a chave **Modo do desenvolvedor** (*Developer mode*).
3. Clique em **Carregar extensão descompactada** (*Load unpacked*).
4. Selecione a pasta `dist` deste projeto:
   `C:\Users\Pichau\.gemini\antigravity-ide\scratch\neuropilot-agent\dist`
5. Fixe o ícone do **NewtonAgent**.

---

## 🛠️ Como Utilizar e Testar

1. **Configuração da API (BYOK)**:
   - Clique no ícone do NewtonAgent para abrir a barra lateral.
   - Clique na aba **Config**.
   - Escolha o preset desejado:
     - **NVIDIA NIM**: insira sua chave `nvapi-...` do [build.nvidia.com](https://build.nvidia.com).
     - **OpenAI**: insira sua chave `sk-...`.
     - **Gemini**: insira sua chave do AI Studio.
     - **Custom**: para modelos locais como Ollama (`http://localhost:11434/v1`).
   - Clique em **Testar Conexão** para validar a latência e chave.
   - Clique em **Salvar**.

2. **Testando com a página Demo**:
   - Abra o arquivo de teste `demo/quiz.html` em uma aba do navegador:
     `file:///C:/Users/Pichau/.gemini/antigravity-ide/scratch/neuropilot-agent/demo/quiz.html`
   - No Side Panel do NewtonAgent (aba Chat), envie uma instrução como:
     > *"Responda este formulário de teste até o final marcando as alternativas corretas e clicando nos botões de avançar."*
   - Acompanhe o log em tempo real (Pensamento, Ação, Resultado e Observação) e veja o agente destacar os elementos na tela com o overlay prateado com iluminação metálica!
