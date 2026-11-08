/* ================================================================
   CODESPACE 4.0 — GAME.JS
   Lógica completa do jogo: física, níveis, coletáveis, visual

   SUMÁRIO:
   1. Referências do DOM e variáveis globais
   2. Sistema de estrelas (fundo animado)
   3. Sistema de estrelas cadentes
   4. Definição dos 6 níveis (com requisitos de comandos)
   5. Coletáveis (cristais de energia)
   6. Carregamento de nível
   7. API do aluno (frente, tras, subir, descer, etc.)
   8. Validação de código por nível
   9. Desenho/renderização (canvas)
   10. Loop de física e movimento (com delta time)
   11. Colisões e fim de turno
   12. Controle da introdução (multi-página)
   13. Eventos e inicialização
   ================================================================ */


/* ================================================================
   1. REFERÊNCIAS DO DOM E VARIÁVEIS GLOBAIS
   ================================================================ */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const logContainer = document.getElementById("historyLog");

// --- Estado principal do jogo ---
let nivel = 1;           // Nível atual (1 a 6)
// Sistema de vidas removido — o jogador pode tentar quantas vezes quiser
let combustivel = 100;   // Combustível atual (%) — sempre 100% no início de cada nível
let cristaisSalvos = 0;  // Cristais confirmados de níveis anteriores
let cristaisColetados = 0; // Total de cristais acumulados (salvos + fase atual)

// --- Objeto da nave ---
let nave = {
    x: 50, y: 250,       // Posição inicial
    vx: 0, vy: 0,        // Velocidade atual
    angle: 0,             // Ângulo visual atual (suavizado)
    targetAngle: 0,       // Ângulo alvo (pra onde quer virar)
    size: 20,             // Tamanho da nave
    speed: 3.5            // Velocidade base de movimento
};

// --- Objetivo (destino que a nave precisa alcançar) ---
let objetivo = { x: 640, y: 250, size: 24 };

// --- Obstáculos e itens ---
let meteoros = [];        // Lista de meteoros do nível atual
let cristais = [];        // Lista de cristais coletáveis no nível

// --- Fila de comandos da execução ---
let comandosFila = [];         // Comandos pendentes para executar
let historicoComandos = [];    // Histórico visual de todos os comandos
let indiceComandoAtual = 0;    // Índice do comando sendo executado

// --- Controle de execução ---
let executando = false;          // Se a nave está em movimento
let tempoDoComandoAtual = 0;     // Tempo acumulado do comando atual (em ms)
let idAnimacaoFisica = null;     // ID do requestAnimationFrame

// --- Delta Time para física consistente ---
let ultimoTempo = 0;             // Tempo do último frame
const TEMPO_POR_COMANDO = 267;   // Cada comando dura 267ms (tempo real, independente de FPS)
const FPS_ALVO = 60;             // FPS alvo para física
const INTERVALO_FRAME = 1000 / FPS_ALVO; // ~16.67ms por frame

// --- Interface de sobreposição (sucesso/fracasso/validação) ---
let estadoMenu = "jogando";  // "jogando", "sucesso", "fracasso" ou "validacao"
let msgPrincipal = "";        // Mensagem exibida no overlay
let botaoTexto = "";          // Texto do botão no overlay
let errosValidacao = [];      // Lista de erros de validação
let areaBotaoCanvas = { x: 200, y: 290, w: 300, h: 45 }; // Posição do botão no canvas
let btnValidacaoY = 320;      // Posição Y dinâmica do botão na tela de validação

// --- Deslocamento físico aproximado por comando (16 passos a 60fps) ---
const DESLOCAMENTO_X = 56;       // Pixels percorridos por comando frente/tras (~16 * 3.5)
const DESLOCAMENTO_Y = 39.2;     // Pixels percorridos por comando subir/descer (~16 * 2.45)
const LIMITE_MAX_COMANDOS = 120; // Proteção contra loops infinitos gerando comandos demais

// --- Posição simulada da nave durante o planejamento (interpretação síncrona) ---
let simX = 50;
let simY = 250;


/* ================================================================
   2. SISTEMA DE ESTRELAS (fundo animado com brilho pulsante)
   Cada estrela tem posição, tamanho e brilho que muda com o tempo
   ================================================================ */

let estrelas = [];

// Gera 120 estrelas com propriedades aleatórias
for (let i = 0; i < 120; i++) {
    estrelas.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2.5 + 0.5,    // Tamanho entre 0.5 e 3
        alpha: Math.random(),                 // Brilho inicial
        velocidadePulso: 0.005 + Math.random() * 0.02,  // Quão rápido pulsa
        fase: Math.random() * Math.PI * 2    // Fase do pulso (pra não pulsarem juntas)
    });
}


/* ================================================================
   3. SISTEMA DE ESTRELAS CADENTES
   Riscos luminosos que cruzam a tela de vez em quando
   ================================================================ */

let estrelasCadentes = [];

// Cria uma nova estrela cadente com posição e direção aleatória
function criarEstrelaCadente() {
    estrelasCadentes.push({
        x: Math.random() * canvas.width * 0.5,         // Começa na metade esquerda
        y: Math.random() * canvas.height * 0.3,         // Começa na parte de cima
        velocidadeX: 4 + Math.random() * 6,              // Velocidade horizontal (rápida)
        velocidadeY: 2 + Math.random() * 3,              // Velocidade vertical
        comprimento: 30 + Math.random() * 50,             // Tamanho do rastro
        vida: 0,                                          // Frames de vida atual
        vidaMax: 40 + Math.floor(Math.random() * 40),     // Quantos frames dura
        alpha: 0.6 + Math.random() * 0.4                  // Brilho
    });
}

// Atualiza posição e remove as que já morreram
function atualizarEstrelasCadentes() {
    // Chance de criar uma nova a cada frame (low chance = esporádico)
    if (Math.random() < 0.015) {
        criarEstrelaCadente();
    }

    estrelasCadentes = estrelasCadentes.filter(ec => {
        ec.x += ec.velocidadeX;
        ec.y += ec.velocidadeY;
        ec.vida++;
        return ec.vida < ec.vidaMax; // Remove se a vida acabou
    });
}

// Desenha todas as estrelas cadentes ativas
function desenharEstrelasCadentes() {
    estrelasCadentes.forEach(ec => {
        // Fade in no início e fade out no final
        let progresso = ec.vida / ec.vidaMax;
        let opacidade = ec.alpha;
        if (progresso < 0.2) opacidade *= progresso / 0.2;       // Fade in
        if (progresso > 0.7) opacidade *= (1 - progresso) / 0.3; // Fade out

        // Desenha o rastro como uma linha com gradiente
        let gradiente = ctx.createLinearGradient(
            ec.x, ec.y,
            ec.x - ec.velocidadeX * (ec.comprimento / ec.velocidadeX),
            ec.y - ec.velocidadeY * (ec.comprimento / ec.velocidadeX)
        );
        gradiente.addColorStop(0, `rgba(255, 255, 255, ${opacidade})`);
        gradiente.addColorStop(1, `rgba(255, 255, 255, 0)`);

        ctx.strokeStyle = gradiente;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ec.x, ec.y);
        ctx.lineTo(
            ec.x - ec.velocidadeX * (ec.comprimento / ec.velocidadeX),
            ec.y - ec.velocidadeY * (ec.comprimento / ec.velocidadeX)
        );
        ctx.stroke();
    });
}


/* ================================================================
   4. DEFINIÇÃO DOS 6 NÍVEIS
   Cada nível tem: descrição, dica, posição do objetivo,
   meteoros fixos, cristais fixos, combustível inicial e

   *** NOVIDADE: REQUISITOS DE CÓDIGO ***
   - comandosObrigatorios: comandos que DEVEM ser usados
   - comandosProibidos: comandos que NÃO PODEM ser usados
   - estruturasObrigatorias: estruturas de controle (if, for, while)
   - cristaisObrigatorios: quantos cristais deve coletar no mínimo

   Níveis 1-2: Fáceis (comandos simples)
   Níveis 3-4: Médios (precisam de if/else)
   Níveis 5-6: Difíceis (precisam de for/while + condicionais)
   ================================================================ */

const NIVEIS = [
    // --- NÍVEL 1: Só ir pra frente (sem obstáculos) ---
    {
        descricao: "Espaço Livre",
        dica: "Simples! Use frente() para chegar ao objetivo. Ex: frente(10);",
        objetivo: { x: 640, y: 250 },
        combustivel: 100,
        meteoros: [],
        cristais: [
            { x: 200, y: 250 },
            { x: 400, y: 250 }
        ],
        // Requisitos do nível 1
        comandosObrigatorios: ["frente"],
        comandosProibidos: ["tras"],
        estruturasObrigatorias: [],  // Não precisa de if/for/while
        cristaisObrigatorios: 0      // Opcional coletar cristais
    },

    // --- NÍVEL 2: Precisa subir e ir pra frente ---
    {
        descricao: "Rota Diagonal",
        dica: "Combine frente() com subir() ou descer() para alcançar o alvo!",
        objetivo: { x: 640, y: 100 },
        combustivel: 100,
        meteoros: [],
        cristais: [
            { x: 200, y: 200 },
            { x: 350, y: 150 },
            { x: 500, y: 100 }
        ],
        // Requisitos do nível 2
        comandosObrigatorios: ["frente", "subir"],
        comandosProibidos: ["tras"],
        estruturasObrigatorias: [],
        cristaisObrigatorios: 0
    },

    // --- NÍVEL 3: Primeiro meteoro, precisa decidir se sobe ou desce ---
    {
        descricao: "Primeiro Asteroide",
        dica: "Use if/else com alinhado() para decidir se precisa subir ou ir direto! Ex: if(!alinhado()) { subir(3); }",
        objetivo: { x: 640, y: 350 },
        combustivel: 100,
        meteoros: [
            { x: 300, y: 250, radius: 30 },
            { x: 450, y: 180, radius: 22 }
        ],
        cristais: [
            { x: 200, y: 350 },
            { x: 550, y: 350 }
        ],
        // Requisitos do nível 3
        comandosObrigatorios: ["frente"],
        comandosProibidos: [],
        estruturasObrigatorias: ["if"],  // Precisa usar if/else
        cristaisObrigatorios: 0
    },

    // --- NÍVEL 4: Mais meteoros, caminho mais complexo ---
    {
        descricao: "Campo de Asteroides",
        dica: "Use if(obterY() > 250) para checar sua altura e decidir para onde ir!",
        objetivo: { x: 640, y: 150 },
        combustivel: 100,
        meteoros: [
            { x: 220, y: 300, radius: 28 },
            { x: 350, y: 150, radius: 25 },
            { x: 480, y: 280, radius: 32 },
            { x: 400, y: 400, radius: 20 }
        ],
        cristais: [
            { x: 150, y: 150 },
            { x: 300, y: 80 },
            { x: 550, y: 200 }
        ],
        // Requisitos do nível 4
        comandosObrigatorios: ["frente", "subir"],
        comandosProibidos: [],
        estruturasObrigatorias: ["if"],
        cristaisObrigatorios: 1  // Precisa pegar pelo menos 1 cristal
    },

    // --- NÍVEL 5: Muitos obstáculos, precisa de loop ---
    {
        descricao: "Labirinto Cósmico",
        dica: "Use um loop for para repetir movimentos! Ex: for(let i=0; i<3; i++) { frente(2); subir(1); }",
        objetivo: { x: 640, y: 400 },
        combustivel: 100,
        meteoros: [
            { x: 180, y: 150, radius: 25 },
            { x: 280, y: 330, radius: 28 },
            { x: 380, y: 180, radius: 22 },
            { x: 480, y: 350, radius: 30 },
            { x: 550, y: 120, radius: 20 },
            { x: 350, y: 450, radius: 18 }
        ],
        cristais: [
            { x: 130, y: 300 },
            { x: 320, y: 80 },
            { x: 450, y: 250 },
            { x: 600, y: 400 }
        ],
        // Requisitos do nível 5
        comandosObrigatorios: ["frente"],
        comandosProibidos: ["tras"],
        estruturasObrigatorias: ["for"],  // Precisa usar loop for
        cristaisObrigatorios: 2
    },

    // --- NÍVEL 6: O mais difícil — combina tudo ---
    {
        descricao: "Missão Final",
        dica: "Use while(!alinhado()) com subir/descer, depois for para avançar entre os meteoros. Boa sorte!",
        objetivo: { x: 640, y: 80 },
        combustivel: 100,
        meteoros: [
            { x: 150, y: 200, radius: 22 },
            { x: 250, y: 350, radius: 30 },
            { x: 300, y: 100, radius: 20 },
            { x: 400, y: 270, radius: 35 },
            { x: 450, y: 420, radius: 25 },
            { x: 520, y: 150, radius: 28 },
            { x: 580, y: 350, radius: 22 },
            { x: 350, y: 50, radius: 18 }
        ],
        cristais: [
            { x: 100, y: 100 },
            { x: 220, y: 450 },
            { x: 380, y: 180 },
            { x: 500, y: 80 },
            { x: 620, y: 300 }
        ],
        // Requisitos do nível 6
        comandosObrigatorios: ["frente"],
        comandosProibidos: [],
        estruturasObrigatorias: ["while"],  // Precisa usar while
        cristaisObrigatorios: 3
    }
];


/* ================================================================
   5. COLETÁVEIS (Cristais de Energia)
   Ficam espalhados pelo mapa. Quando a nave passa perto,
   coleta automaticamente e ganha combustível extra.
   ================================================================ */

// Gera os pontos irregulares dos meteoros (formato rochoso)
function gerarPontosMeteoro(radius, semente) {
    let pontos = [];
    for (let p = 0; p < 9; p++) {
        let ang = (p / 9) * Math.PI * 2;
        let varRaio = radius * (0.7 + numeroPrevisivel(semente + p) * 0.5);
        pontos.push({
            x: Math.cos(ang) * varRaio,
            y: Math.sin(ang) * varRaio
        });
    }
    return pontos;
}

// Gerador pseudo-aleatório determinístico (mesmo resultado pra mesma semente)
function numeroPrevisivel(semente) {
    let x = Math.sin(semente) * 10000;
    return x - Math.floor(x);
}


/* ================================================================
   6. CARREGAMENTO DE NÍVEL
   Configura o nível com base na definição em NIVEIS[]
   ================================================================ */

function carregarNivel(resetCompleto = true) {
    // Cancela qualquer animação em andamento
    if (idAnimacaoFisica) {
        cancelAnimationFrame(idAnimacaoFisica);
        idAnimacaoFisica = null;
    }

    // Pega a definição do nível atual (índice 0-based)
    let def = NIVEIS[nivel - 1];

    if (resetCompleto) {
        // Reseta posição da nave para o início
        nave.x = 50; nave.y = 250;
        nave.vx = 0; nave.vy = 0;
        nave.angle = 0; nave.targetAngle = 0;

        // Reseta posição simulada
        simX = nave.x;
        simY = nave.y;

        // Carrega combustível do nível
        combustivel = def.combustivel;

        // Reseta estado do jogo
        estadoMenu = "jogando";
        historicoComandos = [];
        atualizarPainelHistorico("Motores prontos. Digite os comandos e compile.");
    }

    // Reseta estado de execução
    executando = false;
    comandosFila = [];
    tempoDoComandoAtual = 0;
    ultimoTempo = 0;
    indiceComandoAtual = 0;

    // Carrega posição do objetivo
    objetivo.x = def.objetivo.x;
    objetivo.y = def.objetivo.y;

    // Carrega meteoros com formato irregular
    meteoros = def.meteoros.map((m, i) => ({
        x: m.x,
        y: m.y,
        radius: m.radius,
        pontos: gerarPontosMeteoro(m.radius, nivel * 100 + i)
    }));

    // Carrega cristais do nível (cópia para poder remover ao coletar)
    cristais = def.cristais.map(c => ({
        x: c.x,
        y: c.y,
        coletado: false,
        tamanho: 10,
        angulo: Math.random() * Math.PI * 2  // Ângulo inicial de rotação visual
    }));

    // --- ATUALIZA DICA COM REQUISITOS DO NÍVEL ---
    let dicaHTML = def.dica;

    // Adiciona requisitos visuais na dica
    if (def.comandosObrigatorios && def.comandosObrigatorios.length > 0) {
        dicaHTML += "\n\n✅ OBRIGATÓRIO: " + def.comandosObrigatorios.join("(), ") + "()";
    }

    if (def.comandosProibidos && def.comandosProibidos.length > 0) {
        dicaHTML += "\n🚫 PROIBIDO: " + def.comandosProibidos.join("(), ") + "()";
    }

    if (def.estruturasObrigatorias && def.estruturasObrigatorias.length > 0) {
        let estruturasNomes = {
            "if": "if/else (condicional)",
            "for": "for (loop)",
            "while": "while (loop)"
        };
        let nomes = def.estruturasObrigatorias.map(e => estruturasNomes[e] || e);
        dicaHTML += "\n⚡ ESTRUTURA: " + nomes.join(" ou ");
    }

    if (def.cristaisObrigatorios > 0) {
        dicaHTML += "\n💎 CRISTAIS MÍNIMOS: " + def.cristaisObrigatorios;
    }

    document.getElementById("hintText").innerText = dicaHTML;

    // Atualiza HUD
    atualizarHUD();

    // Desenha o frame inicial
    desenhar();
}


/* ================================================================
   7. API DO ALUNO
   Funções que o aluno pode chamar no código:
   frente(), tras(), subir(), descer(), obterY(), obterX(), alinhado()

   IMPORTANTE: Durante a compilação síncrona (geração da fila),
   as funções usam a posição simulada (simX, simY). Assim,
   laços como while(!alinhado()) atualizam a altura a cada
   chamada de subir()/descer(), permitindo que a condição
   seja satisfeita sem entrar em loop infinito!
   ================================================================ */

// Retorna a posição Y (altura) da nave (arredondada para facilidade de uso)
function obterY() {
    return Math.round(executando ? nave.y : simY);
}

// Retorna a posição X da nave
function obterX() {
    return Math.round(executando ? nave.x : simX);
}

// Retorna true se a nave está na mesma altura que o objetivo (com margem de 30px)
function alinhado() {
    let yAtual = executando ? nave.y : simY;
    return Math.abs(yAtual - objetivo.y) < 30;
}

// Move a nave para a direita N vezes
function frente(vezes = 1) {
    let v = Math.max(1, Math.floor(Number(vezes) || 1));
    for (let i = 0; i < v; i++) {
        if (comandosFila.length >= LIMITE_MAX_COMANDOS) {
            throw new Error(`Limite de ${LIMITE_MAX_COMANDOS} comandos atingido! Verifique se seu loop não é infinito.`);
        }
        comandosFila.push("frente");
        historicoComandos.push({ tipo: "frente", status: "pendente" });
        simX += DESLOCAMENTO_X;
    }
}

// Move a nave para a esquerda N vezes
function tras(vezes = 1) {
    let v = Math.max(1, Math.floor(Number(vezes) || 1));
    for (let i = 0; i < v; i++) {
        if (comandosFila.length >= LIMITE_MAX_COMANDOS) {
            throw new Error(`Limite de ${LIMITE_MAX_COMANDOS} comandos atingido! Verifique se seu loop não é infinito.`);
        }
        comandosFila.push("tras");
        historicoComandos.push({ tipo: "tras", status: "pendente" });
        simX -= DESLOCAMENTO_X;
    }
}

// Move a nave para cima N vezes
function subir(vezes = 1) {
    let v = Math.max(1, Math.floor(Number(vezes) || 1));
    for (let i = 0; i < v; i++) {
        if (comandosFila.length >= LIMITE_MAX_COMANDOS) {
            throw new Error(`Limite de ${LIMITE_MAX_COMANDOS} comandos atingido! Verifique se seu loop não é infinito.`);
        }
        comandosFila.push("subir");
        historicoComandos.push({ tipo: "subir", status: "pendente" });
        simY -= DESLOCAMENTO_Y;
    }
}

// Move a nave para baixo N vezes
function descer(vezes = 1) {
    let v = Math.max(1, Math.floor(Number(vezes) || 1));
    for (let i = 0; i < v; i++) {
        if (comandosFila.length >= LIMITE_MAX_COMANDOS) {
            throw new Error(`Limite de ${LIMITE_MAX_COMANDOS} comandos atingido! Verifique se seu loop não é infinito.`);
        }
        comandosFila.push("descer");
        historicoComandos.push({ tipo: "descer", status: "pendente" });
        simY += DESLOCAMENTO_Y;
    }
}


/* ================================================================
   8. VALIDAÇÃO DE CÓDIGO POR NÍVEL
   Verifica se o código do aluno atende aos requisitos do nível
   ================================================================ */

function validarCodigoPorNivel(textoCodigo) {
    let def = NIVEIS[nivel - 1];
    let erros = [];

    // --- Verifica comandos obrigatórios ---
    if (def.comandosObrigatorios && def.comandosObrigatorios.length > 0) {
        for (let cmd of def.comandosObrigatorios) {
            // Verifica se o comando foi usado no código
            let regex = new RegExp(`\\b${cmd}\\s*\\(`, 'g');
            if (!regex.test(textoCodigo)) {
                erros.push({ tipo: "obrigatorio", texto: `Você precisa usar o comando ${cmd}()` });
            }
        }
    }

    // --- Verifica comandos proibidos ---
    if (def.comandosProibidos && def.comandosProibidos.length > 0) {
        for (let cmd of def.comandosProibidos) {
            let regex = new RegExp(`\\b${cmd}\\s*\\(`, 'g');
            if (regex.test(textoCodigo)) {
                erros.push({ tipo: "proibido", texto: `Não pode usar ${cmd}() neste nível` });
            }
        }
    }

    // --- Verifica estruturas de controle obrigatórias ---
    if (def.estruturasObrigatorias && def.estruturasObrigatorias.length > 0) {
        for (let estrutura of def.estruturasObrigatorias) {
            if (estrutura === "if") {
                if (!/\bif\s*\(/.test(textoCodigo)) {
                    erros.push({ tipo: "obrigatorio", texto: "Você precisa usar if/else para tomar decisões" });
                }
            } else if (estrutura === "for") {
                if (!/\bfor\s*\(/.test(textoCodigo)) {
                    erros.push({ tipo: "obrigatorio", texto: "Você precisa usar um loop for para repetir comandos" });
                }
            } else if (estrutura === "while") {
                if (!/\bwhile\s*\(/.test(textoCodigo)) {
                    erros.push({ tipo: "obrigatorio", texto: "Você precisa usar um loop while para repetir enquanto condição for verdadeira" });
                }
            }
        }
    }

    return erros;
}


/* ================================================================
   9. ATUALIZAÇÃO DE HUD E HISTÓRICO
   ================================================================ */

function atualizarHUD() {
    let def = NIVEIS[Math.max(0, Math.min(nivel - 1, NIVEIS.length - 1))];
    let cristaisNivelAtual = cristais.filter(c => c.coletado).length;
    cristaisColetados = cristaisSalvos + cristaisNivelAtual;

    document.getElementById("txtNivel").innerText = `Nível: ${Math.max(1, nivel)}/6 — ${def ? def.descricao : ''}`;
    document.getElementById("txtCombustivel").innerText = `⛽ Combustível: ${Math.max(0, Math.ceil(combustivel))}%`;
    document.getElementById("txtPontos").innerText = `💎 Cristais: ${cristaisColetados}`;
}

// Atualiza o painel visual de histórico de comandos
function atualizarPainelHistorico(mensagemAlternativa = null) {
    if (mensagemAlternativa) {
        logContainer.innerHTML = `<span>${mensagemAlternativa}</span>`;
        return;
    }
    logContainer.innerHTML = "";
    historicoComandos.forEach((cmd, idx) => {
        let span = document.createElement("span");
        span.className = `log-item ${cmd.status}`;
        span.innerText = `${idx + 1}.${cmd.tipo}()`;
        logContainer.appendChild(span);
    });
}


/* ================================================================
   10. DESENHO / RENDERIZAÇÃO DO CANVAS
   Tudo que aparece na tela é desenhado aqui
   ================================================================ */

// Variável para controle do tempo de animação
let tempoAnimacao = 0;

function desenhar() {
    tempoAnimacao++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- 10.1 FUNDO: Gradiente espacial ---
    let gradFundo = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 50,
        canvas.width / 2, canvas.height / 2, canvas.width
    );
    gradFundo.addColorStop(0, "#0a0a20");
    gradFundo.addColorStop(0.5, "#060612");
    gradFundo.addColorStop(1, "#020208");
    ctx.fillStyle = gradFundo;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- 10.2 ESTRELAS: pulsam com seno ---
    estrelas.forEach(e => {
        // Calcula brilho pulsante usando seno
        e.fase += e.velocidadePulso;
        e.alpha = 0.3 + Math.abs(Math.sin(e.fase)) * 0.7;

        ctx.globalAlpha = e.alpha;
        ctx.fillStyle = "#ffffff";

        // Estrelas maiores têm um brilho ao redor
        if (e.size > 2) {
            ctx.shadowBlur = 4;
            ctx.shadowColor = "rgba(100, 150, 255, 0.5)";
        }
        ctx.fillRect(e.x, e.y, e.size, e.size);
        ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1.0;

    // --- 10.3 ESTRELAS CADENTES ---
    atualizarEstrelasCadentes();
    desenharEstrelasCadentes();

    // --- 10.4 GRADE SUTIL (dá sensação de espaço/profundidade) ---
    ctx.strokeStyle = "rgba(50, 50, 120, 0.08)";
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx < canvas.width; gx += 50) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
    }
    for (let gy = 0; gy < canvas.height; gy += 50) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
    }

    // --- 10.5 BORDAS DO CANVAS (visual de limite) ---
    ctx.strokeStyle = "rgba(255, 50, 50, 0.3)";
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // --- 10.6 CRISTAIS DE ENERGIA ---
    cristais.forEach(c => {
        if (c.coletado) return; // Não desenha se já foi coletado

        c.angulo += 0.03; // Rotação contínua

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angulo);

        // Brilho ao redor do cristal
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(200, 100, 255, 0.6)";

        // Desenha um losango (formato cristal)
        ctx.fillStyle = "#cc66ff";
        ctx.beginPath();
        ctx.moveTo(0, -c.tamanho);          // Topo
        ctx.lineTo(c.tamanho * 0.6, 0);     // Direita
        ctx.lineTo(0, c.tamanho);            // Baixo
        ctx.lineTo(-c.tamanho * 0.6, 0);    // Esquerda
        ctx.closePath();
        ctx.fill();

        // Brilho interno
        ctx.fillStyle = "rgba(255, 200, 255, 0.5)";
        ctx.beginPath();
        ctx.moveTo(0, -c.tamanho * 0.5);
        ctx.lineTo(c.tamanho * 0.3, 0);
        ctx.lineTo(0, c.tamanho * 0.5);
        ctx.lineTo(-c.tamanho * 0.3, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        ctx.shadowBlur = 0;
    });

    // --- 10.7 OBJETIVO/PORTAL (ponto de chegada com efeito pulsante) ---
    let pulso = Math.sin(tempoAnimacao * 0.05) * 5; // Pulsa o tamanho
    let tamanhoObj = objetivo.size + pulso;

    // Anel externo (hitbox visual)
    ctx.strokeStyle = "rgba(0, 255, 204, 0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(objetivo.x, objetivo.y, tamanhoObj + 15, 0, Math.PI * 2);
    ctx.stroke();

    // Anel interno
    ctx.strokeStyle = "rgba(0, 255, 204, 0.3)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(objetivo.x, objetivo.y, tamanhoObj + 8, 0, Math.PI * 2);
    ctx.stroke();

    // Gradiente do objetivo
    let gradObj = ctx.createRadialGradient(
        objetivo.x, objetivo.y, 2,
        objetivo.x, objetivo.y, tamanhoObj
    );
    gradObj.addColorStop(0, '#ffffff');
    gradObj.addColorStop(0.3, '#00ffcc');
    gradObj.addColorStop(0.7, 'rgba(0,255,204,0.3)');
    gradObj.addColorStop(1, 'rgba(0,255,204,0)');

    ctx.fillStyle = gradObj;
    ctx.beginPath();
    ctx.arc(objetivo.x, objetivo.y, tamanhoObj, 0, Math.PI * 2);
    ctx.fill();

    // Texto "DESTINO" acima do objetivo
    ctx.font = "bold 10px 'Segoe UI'";
    ctx.fillStyle = "rgba(0,255,204,0.6)";
    ctx.textAlign = "center";
    ctx.fillText("DESTINO", objetivo.x, objetivo.y - tamanhoObj - 15);

    // --- 10.8 METEOROS (rochas espaciais com sombra) ---
    meteoros.forEach(m => {
        // Sombra do meteoro
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(255, 100, 50, 0.15)";

        ctx.fillStyle = "#3a3028";
        ctx.strokeStyle = "#6a5d51";
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(m.x + m.pontos[0].x, m.y + m.pontos[0].y);
        for (let p = 1; p < m.pontos.length; p++) {
            ctx.lineTo(m.x + m.pontos[p].x, m.y + m.pontos[p].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Detalhes internos (crateras)
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.arc(m.x - m.radius * 0.2, m.y - m.radius * 0.1, m.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(m.x + m.radius * 0.25, m.y + m.radius * 0.2, m.radius * 0.12, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    });

    // --- 10.9 NAVE (design melhorado com propulsão) ---
    ctx.save();
    ctx.translate(nave.x, nave.y);
    ctx.rotate(nave.angle);

    // Chama de propulsão (só quando executando)
    if (executando && combustivel > 0 && estadoMenu === "jogando") {
        let comandoAtual = comandosFila[0];
        let chamaSize = 10 + Math.random() * 12;

        // Cor da chama: gradiente laranja → vermelho
        let gradChama = ctx.createLinearGradient(0, 0, -chamaSize * 2, 0);
        gradChama.addColorStop(0, "rgba(255, 200, 50, 0.9)");
        gradChama.addColorStop(0.5, "rgba(255, 100, 0, 0.7)");
        gradChama.addColorStop(1, "rgba(255, 30, 0, 0)");

        ctx.fillStyle = gradChama;
        ctx.beginPath();
        if (comandoAtual === "tras") {
            // Chama sai pela frente (nave indo pra trás)
            ctx.moveTo(nave.size, -5);
            ctx.lineTo(nave.size + chamaSize, 0);
            ctx.lineTo(nave.size, 5);
        } else {
            // Chama sai por trás (nave indo pra frente, subindo ou descendo)
            ctx.moveTo(-nave.size, -5);
            ctx.lineTo(-nave.size - chamaSize, 0);
            ctx.lineTo(-nave.size, 5);
        }
        ctx.fill();

        // Brilho da propulsão
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(255, 150, 0, 0.5)";
    }

    // Corpo da nave
    ctx.fillStyle = "#00ddff";
    ctx.beginPath();
    ctx.moveTo(nave.size + 4, 0);                  // Ponta da frente
    ctx.lineTo(-nave.size, -nave.size * 0.8);       // Asa superior
    ctx.lineTo(-nave.size * 0.5, -nave.size * 0.2); // Entalhe superior
    ctx.lineTo(-nave.size * 0.5, nave.size * 0.2);  // Entalhe inferior
    ctx.lineTo(-nave.size, nave.size * 0.8);         // Asa inferior
    ctx.closePath();
    ctx.fill();

    // Detalhe: linha central da nave
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(nave.size, 0);
    ctx.lineTo(-nave.size * 0.3, 0);
    ctx.stroke();

    // Cockpit (janela da cabine)
    ctx.fillStyle = "rgba(150, 220, 255, 0.7)";
    ctx.beginPath();
    ctx.arc(nave.size * 0.2, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;

    // --- 10.10 SOBREPOSIÇÃO DE INTERFACE (sucesso/fracasso/validação) ---
    if (estadoMenu !== "jogando") {
        // Fundo escurecido
        ctx.fillStyle = "rgba(6, 6, 20, 0.92)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // === TELA DE VALIDAÇÃO (REQUISITOS NÃO ATENDIDOS) ===
        if (estadoMenu === "validacao") {
            ctx.font = "bold 24px 'Segoe UI'";
            ctx.textAlign = "center";
            ctx.fillStyle = "#ffcc00";
            ctx.fillText(msgPrincipal, canvas.width / 2, 100);

            // Linha decorativa
            ctx.strokeStyle = "rgba(255, 204, 0, 0.3)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(150, 120);
            ctx.lineTo(550, 120);
            ctx.stroke();

            // Lista de erros (com quebra automática de linha para mensagens longas)
            let yPos = 160;
            const maxLarguraTexto = 450;

            errosValidacao.forEach((erro) => {
                let texto = typeof erro === "object" ? erro.texto : String(erro);
                let tipo = typeof erro === "object" ? erro.tipo : "proibido";

                // Ícone
                if (tipo === "obrigatorio") {
                    ctx.fillStyle = "#00ff88";
                    ctx.font = "bold 18px 'Segoe UI'";
                    ctx.textAlign = "left";
                    ctx.fillText("✔", 140, yPos);
                    ctx.fillStyle = "#aaffcc";
                } else {
                    ctx.fillStyle = "#ff4444";
                    ctx.font = "bold 18px 'Segoe UI'";
                    ctx.textAlign = "left";
                    ctx.fillText("✖", 140, yPos);
                    ctx.fillStyle = "#ffaaaa";
                }

                ctx.font = "14px 'Segoe UI'";
                ctx.textAlign = "left";

                // Divide o texto em linhas para não estourar o canvas
                let palavras = texto.split(" ");
                let linhaAtual = "";

                palavras.forEach(p => {
                    let testeLinha = linhaAtual ? (linhaAtual + " " + p) : p;
                    if (ctx.measureText(testeLinha).width > maxLarguraTexto && linhaAtual) {
                        ctx.fillText(linhaAtual, 170, yPos);
                        yPos += 22;
                        linhaAtual = p;
                    } else {
                        linhaAtual = testeLinha;
                    }
                });
                if (linhaAtual) {
                    ctx.fillText(linhaAtual, 170, yPos);
                }
                yPos += 30;
            });

            // Dica de apoio
            ctx.textAlign = "center";
            ctx.font = "italic 13px 'Segoe UI'";
            ctx.fillStyle = "#6688bb";
            ctx.fillText("💡 Verifique a dica do nível para ver todos os requisitos", canvas.width / 2, yPos + 15);

            // Botão de fechar dinâmico (não sobrepõe o texto)
            btnValidacaoY = Math.max(320, Math.min(yPos + 35, 430));

            ctx.fillStyle = "#ffcc00";
            ctx.beginPath();
            ctx.roundRect(areaBotaoCanvas.x, btnValidacaoY, areaBotaoCanvas.w, areaBotaoCanvas.h, 8);
            ctx.fill();

            ctx.font = "bold 16px 'Segoe UI'";
            ctx.fillStyle = "#050510";
            ctx.fillText(botaoTexto, canvas.width / 2, btnValidacaoY + 28);
            return;
        }

        // === TELAS DE SUCESSO/FRACASSO ===
        // Mensagem principal
        ctx.font = "bold 26px 'Segoe UI'";
        ctx.textAlign = "center";
        if (estadoMenu === "sucesso") ctx.fillStyle = "#00ffcc";
        else ctx.fillStyle = "#ff3366";

        ctx.fillText(msgPrincipal, canvas.width / 2, canvas.height / 2 - 40);

        // Submensagem
        ctx.font = "14px 'Segoe UI'";
        ctx.fillStyle = "#8fa0dd";
        let sub = estadoMenu === "sucesso"
            ? "Excelente algoritmo de navegação!"
            : "Ajuste seus comandos e tente de novo.";
        ctx.fillText(sub, canvas.width / 2, canvas.height / 2);

        // Cristais coletados na mensagem
        if (estadoMenu === "sucesso") {
            ctx.font = "13px 'Segoe UI'";
            ctx.fillStyle = "#cc66ff";
            ctx.fillText(`💎 Cristais coletados: ${cristaisColetados}`, canvas.width / 2, canvas.height / 2 + 25);
        }

        // Botão no canvas
        ctx.fillStyle = estadoMenu === "sucesso" ? "#00ffcc" : "#ff3366";
        ctx.beginPath();
        ctx.roundRect(areaBotaoCanvas.x, areaBotaoCanvas.y, areaBotaoCanvas.w, areaBotaoCanvas.h, 8);
        ctx.fill();

        ctx.font = "bold 15px 'Segoe UI'";
        ctx.fillStyle = "#050510";
        ctx.fillText(botaoTexto, canvas.width / 2, areaBotaoCanvas.y + 28);
    }
}


/* ================================================================
   11. INICIAR MISSÃO (quando o aluno clica em "Compilar e Iniciar")
   Interpreta o código do aluno e inicia a execução
   ================================================================ */

// Adiciona proteção contra loops infinitos injetando contadores de segurança
function adicionarGuardaDeLoop(codigo) {
    let codigoModificado = "let __loopTotal = 0;\n" + codigo;

    // 1. Loops com bloco {}: while (...) { ou for (...) {
    codigoModificado = codigoModificado.replace(
        /\b(while|for)\s*\(([^)]*)\)\s*\{/g,
        `$1 ($2) { if (++__loopTotal > 1000) throw new Error("Loop infinito detectado no $1! A condição de parada nunca foi atingida.");`
    );

    // 2. Loops de linha única sem bloco: while (...) comando;
    codigoModificado = codigoModificado.replace(
        /\b(while|for)\s*\(([^)]*)\)\s*(?!\{)\s*([^;\n]+;)/g,
        `$1 ($2) { if (++__loopTotal > 1000) throw new Error("Loop infinito detectado no $1! A condição de parada nunca foi atingida."); $3 }`
    );

    return codigoModificado;
}

function iniciarMissao() {
    // Impede iniciar se já está executando
    if (executando) return;

    // Garante que está no estado "jogando"
    estadoMenu = "jogando";

    // Pega o código digitado pelo aluno
    let textoCodigo = document.getElementById("codigoInput").value;

    // --- VALIDAÇÃO DE REQUISITOS DO NÍVEL ---
    let erros = validarCodigoPorNivel(textoCodigo);
    if (erros.length > 0) {
        // Mostra interface integrada de validação
        errosValidacao = erros;
        msgPrincipal = `⚠️ REQUISITOS NÃO ATENDIDOS`;
        botaoTexto = "ENTENDI";
        estadoMenu = "validacao";
        desenhar();
        return;
    }

    // Reseta nave, combustível e cristais do nível para execução limpa do código
    nave.x = 50; nave.y = 250;
    nave.vx = 0; nave.vy = 0;
    nave.angle = 0; nave.targetAngle = 0;
    combustivel = 100; // Sempre 100% no início da execução
    cristais.forEach(c => c.coletado = false);

    // Reseta filas de comando
    comandosFila = [];
    historicoComandos = [];
    tempoDoComandoAtual = 0;
    ultimoTempo = 0;
    indiceComandoAtual = 0;

    // Reseta posição simulada para a posição inicial da nave
    simX = nave.x;
    simY = nave.y;
    atualizarHUD();

    try {
        // Aplica proteção de loop infinito ao código do aluno
        let codigoProtegido = adicionarGuardaDeLoop(textoCodigo);

        // Cria uma função isolada com o código do aluno
        // As funções da API são passadas como parâmetros
        let contextoDoScript = new Function(
            'frente', 'tras', 'subir', 'descer', 'obterY', 'obterX', 'alinhado',
            codigoProtegido
        );
        contextoDoScript(frente, tras, subir, descer, obterY, obterX, alinhado);

        // Se nenhum comando foi gerado, não faz nada
        if (comandosFila.length === 0) return;

        // Inicia a execução
        executando = true;

        // Marca o primeiro comando como "atual"
        if (historicoComandos.length > 0) {
            historicoComandos[0].status = "current";
        }
        atualizarPainelHistorico();

        // Inicia o loop de física
        ultimoTempo = performance.now();
        acumuladorFisica = 0;
        loopDeFisica(ultimoTempo);

    } catch (erro) {
        // Mostra erro de compilação ou execução na interface do jogo
        errosValidacao = [erro.message];
        msgPrincipal = "❌ ERRO NO CÓDIGO";
        botaoTexto = "CORRIGIR CÓDIGO";
        estadoMenu = "validacao";
        desenhar();
    }
}


/* ================================================================
   12. LOOP DE FÍSICA E MOVIMENTO (COM DELTA TIME)

   *** IMPORTANTE: Usa delta time para consistência entre monitores ***
   O loop roda no ritmo do monitor (60Hz, 144Hz, 240Hz...),
   mas a FÍSICA é calculada em passos fixos de ~16.67ms.
   Isso garante velocidade idêntica em qualquer taxa de atualização.
   ================================================================ */

// Acumulador para passos fixos de física
let acumuladorFisica = 0;

function loopDeFisica(tempoAtual) {
    if (!executando || estadoMenu !== "jogando") return;

    // Calcula delta time (tempo desde o último frame em ms)
    let deltaTime = tempoAtual - ultimoTempo;
    ultimoTempo = tempoAtual;

    // Limita delta time para evitar saltos grandes (ex: aba minimizada)
    if (deltaTime > 100) deltaTime = INTERVALO_FRAME;

    // Acumula tempo para processar em passos fixos
    acumuladorFisica += deltaTime;

    // Processa a física em passos fixos de INTERVALO_FRAME (~16.67ms)
    while (acumuladorFisica >= INTERVALO_FRAME) {
        acumuladorFisica -= INTERVALO_FRAME;

        // --- Se não tem mais comandos OU combustível acabou: desaceleração ---
        if (comandosFila.length === 0 || combustivel <= 0) {
            nave.vx *= 0.88;
            nave.vy *= 0.88;
            nave.x += nave.vx;
            nave.y += nave.vy;

            checarColetaCristais();

            if (checarColisaoPortal()) { concluirSucesso(); return; }
            if (checarSaidaBordas())   { concluirMorte();   return; }

            if (Math.abs(nave.vx) < 0.1 && Math.abs(nave.vy) < 0.1) {
                executando = false;
                verificarFimDeTurno();
                return;
            }
            continue;
        }

        // --- Processa o comando atual ---
        let comandoAtual = comandosFila[0];

        if (comandoAtual === "frente") {
            nave.vx = nave.speed;
            nave.vy = 0;
            nave.targetAngle = 0;
        }
        else if (comandoAtual === "tras") {
            nave.vx = -nave.speed;
            nave.vy = 0;
            nave.targetAngle = Math.PI;
        }
        else if (comandoAtual === "subir") {
            nave.vx = 0;
            nave.vy = -nave.speed * 0.7;
            nave.targetAngle = -0.4;
        }
        else if (comandoAtual === "descer") {
            nave.vx = 0;
            nave.vy = nave.speed * 0.7;
            nave.targetAngle = 0.4;
        }

        // Aplica o movimento (1 passo fixo = 1 frame a 60fps)
        nave.x += nave.vx;
        nave.y += nave.vy;

        // Gasta combustível (1 passo fixo)
        combustivel -= 0.2;

        // Suaviza a rotação visual da nave
        nave.angle += (nave.targetAngle - nave.angle) * 0.12;

        checarColetaCristais();

        if (checarColisaoPortal()) { concluirSucesso(); return; }
        if (checarSaidaBordas())   { concluirMorte();   return; }
        if (checarColisoes())      { concluirMorte();   return; }

        // --- Avanço de comando baseado em tempo real ---
        tempoDoComandoAtual += INTERVALO_FRAME;

        if (tempoDoComandoAtual >= TEMPO_POR_COMANDO) {
            if (indiceComandoAtual < historicoComandos.length) {
                historicoComandos[indiceComandoAtual].status = "success";
            }
            comandosFila.shift();
            tempoDoComandoAtual = 0;
            nave.vy *= 0.2;

            indiceComandoAtual++;
            if (indiceComandoAtual < historicoComandos.length) {
                historicoComandos[indiceComandoAtual].status = "current";
            }
            atualizarPainelHistorico();
        }
    }

    // Atualiza HUD e desenha (apenas 1x por frame visual)
    atualizarHUD();
    desenhar();

    // Continua o loop
    idAnimacaoFisica = requestAnimationFrame(loopDeFisica);
}


/* ================================================================
   13. COLISÕES, COLETA E FIM DE TURNO
   ================================================================ */

// Checa se a nave colide com meteoros
function checarColisoes() {
    // Colisão com meteoros
    for (let m of meteoros) {
        let dx = nave.x - m.x;
        let dy = nave.y - m.y;
        let distancia = Math.sqrt(dx * dx + dy * dy);
        if (distancia < m.radius + (nave.size / 2)) return true;
    }
    return false;
}

// *** Checa se a nave saiu das bordas do canvas ***
function checarSaidaBordas() {
    // Margem de tolerância (tamanho da nave)
    let margem = nave.size;

    // Verifica se saiu por qualquer lado
    if (nave.x < -margem || nave.x > canvas.width + margem) return true;
    if (nave.y < -margem || nave.y > canvas.height + margem) return true;

    return false;
}

// *** Checa se a nave colidiu com o portal (hitbox maior) ***
function checarColisaoPortal() {
    let dx = nave.x - objetivo.x;
    let dy = nave.y - objetivo.y;
    let distancia = Math.sqrt(dx * dx + dy * dy);

    // Hitbox do portal é maior (objetivo.size + 15)
    return distancia < objetivo.size + 15;
}

// Checa se a nave está próxima de algum cristal e coleta
function checarColetaCristais() {
    cristais.forEach(c => {
        if (c.coletado) return;
        let dx = nave.x - c.x;
        let dy = nave.y - c.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        // Distância de coleta: 25 pixels
        if (dist < 25) {
            c.coletado = true;
            // Recupera 10% de combustível, respeitando o limite de 100% (tanque cheio)
            combustivel = Math.min(combustivel + 10, 100);
            atualizarHUD();
        }
    });
}

// Nave foi destruída (bateu em meteoro ou saiu da tela)
function concluirMorte() {
    executando = false;
    atualizarHUD();

    // Marca o comando atual como erro no histórico
    if (indiceComandoAtual < historicoComandos.length) {
        historicoComandos[indiceComandoAtual].status = "error";
    }
    atualizarPainelHistorico();

    // Sem sistema de vidas — só reinicia o nível
    msgPrincipal = "💥 MISSÃO FRACASSADA: Nave Destruída!";
    botaoTexto = "TENTAR NOVAMENTE";
    estadoMenu = "fracasso";
    desenhar();
}

// *** Nave chegou ao portal (sucesso instantâneo) ***
function concluirSucesso() {
    executando = false;
    atualizarHUD();

    // Verifica se coletou cristais suficientes
    let def = NIVEIS[nivel - 1];
    let cristaisNivel = cristais.filter(c => c.coletado).length;

    if (def.cristaisObrigatorios > 0 && cristaisNivel < def.cristaisObrigatorios) {
        // Não coletou cristais suficientes
        msgPrincipal = `⚠️ Colete pelo menos ${def.cristaisObrigatorios} cristais!`;
        botaoTexto = "TENTAR NOVAMENTE";
        estadoMenu = "fracasso";
        desenhar();
        return;
    }

    // --- SUCESSO: alcançou o objetivo! ---
    if (nivel < 6) {
        msgPrincipal = `✅ SETOR ${nivel} CONCLUÍDO!`;
        botaoTexto = "PRÓXIMO NÍVEL";
        cristaisSalvos += cristaisNivel;
    } else {
        // Zerou o jogo!
        msgPrincipal = "🏆 CAMPANHA CONCLUÍDA! Almirante do Espaço!";
        botaoTexto = "RECOMEÇAR TUDO";
        nivel = 0; // Vai virar 1 no clique
        cristaisSalvos = 0;
        cristaisColetados = 0;
    }
    estadoMenu = "sucesso";
    desenhar();
}

// Verifica se a nave chegou ao objetivo quando parou de se mover
function verificarFimDeTurno() {
    let dx = nave.x - objetivo.x;
    let dy = nave.y - objetivo.y;
    let distancia = Math.sqrt(dx * dx + dy * dy);

    if (distancia < objetivo.size + 18) {
        // Já deveria ter passado pelo concluirSucesso(), mas mantemos como backup
        concluirSucesso();

    } else if (combustivel <= 0) {
        // --- FRACASSO: ficou sem combustível — pode tentar de novo ---
        atualizarHUD();

        if (indiceComandoAtual < historicoComandos.length) {
            historicoComandos[indiceComandoAtual].status = "error";
        }
        atualizarPainelHistorico();

        msgPrincipal = "⛽ MISSÃO FRACASSADA: Pane Seca!";
        botaoTexto = "TENTAR NOVAMENTE";
        estadoMenu = "fracasso";
    } else {
        // --- A nave parou mas ainda tem combustível e não chegou ---
        // NÃO mostra tela de parada! O aluno pode compilar mais código.
        estadoMenu = "jogando";
    }

    desenhar();
}


/* ================================================================
   14. CONTROLE DA TELA DE INTRODUÇÃO (multi-página)
   ================================================================ */

let paginaIntroAtual = 0;   // Página 0 ou 1 (0 = página 1, 1 = página 2)
const totalPaginasIntro = 2;

const introOverlay = document.getElementById("introOverlay");
const btnIntroPrev = document.getElementById("btnIntroPrev");
const btnIntroNext = document.getElementById("btnIntroNext");
const introIndicator = document.getElementById("introIndicator");

// Atualiza qual página da intro está visível
function atualizarPaginaIntro() {
    // Esconde todas as páginas removendo a classe active
    for (let i = 1; i <= totalPaginasIntro; i++) {
        const pageEl = document.getElementById(`introPage${i}`);
        if (pageEl) pageEl.classList.remove("active");
    }
    // Mostra a página atual adicionando a classe active
    const currentPage = document.getElementById(`introPage${paginaIntroAtual + 1}`);
    if (currentPage) currentPage.classList.add("active");

    // Atualiza estado dos botões de seta
    btnIntroPrev.disabled = (paginaIntroAtual === 0);
    btnIntroNext.disabled = (paginaIntroAtual === totalPaginasIntro - 1);

    // Atualiza indicador visual (● ○)
    let indicador = "";
    for (let i = 0; i < totalPaginasIntro; i++) {
        indicador += (i === paginaIntroAtual) ? "● " : "○ ";
    }
    introIndicator.innerText = indicador.trim();
}

// Navegação entre páginas da intro
btnIntroPrev.addEventListener("click", () => {
    if (paginaIntroAtual > 0) {
        paginaIntroAtual--;
        atualizarPaginaIntro();
    }
});

btnIntroNext.addEventListener("click", () => {
    if (paginaIntroAtual < totalPaginasIntro - 1) {
        paginaIntroAtual++;
        atualizarPaginaIntro();
    }
});

// Botão "Começar Missão" — esconde a intro e inicia o jogo
document.getElementById("btnIntroStart").addEventListener("click", () => {
    introOverlay.style.display = "none";
});

// Botão discreto no canto inferior direito — reabre a intro no início
document.getElementById("btnReverIntro").addEventListener("click", () => {
    paginaIntroAtual = 0;  // Volta para a primeira página
    atualizarPaginaIntro();
    introOverlay.style.display = "flex";
});


/* ================================================================
   15. EVENTOS E INICIALIZAÇÃO
   ================================================================ */

// Botão "Compilar e Iniciar"
document.getElementById("btnIniciar").addEventListener("click", iniciarMissao);

// Botão "Resetar Nível"
document.getElementById("btnReiniciarManual").addEventListener("click", () => carregarNivel(true));

// Clique no canvas (para botões de sucesso/fracasso)
canvas.addEventListener("click", function(evento) {
    if (estadoMenu === "jogando") return; // Ignora cliques durante o jogo

    const rect = canvas.getBoundingClientRect();
    // Calcula posição do clique ajustada ao tamanho real do canvas
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cliqueX = (evento.clientX - rect.left) * scaleX;
    const cliqueY = (evento.clientY - rect.top) * scaleY;

    // Verifica se clicou no botão
    let btnY = (estadoMenu === "validacao") ? btnValidacaoY : areaBotaoCanvas.y;
    if (cliqueX >= areaBotaoCanvas.x && cliqueX <= areaBotaoCanvas.x + areaBotaoCanvas.w &&
        cliqueY >= btnY && cliqueY <= btnY + areaBotaoCanvas.h) {

        if (estadoMenu === "validacao") {
            // Fecha a tela de validação e volta ao jogo
            estadoMenu = "jogando";
            desenhar();
        } else if (estadoMenu === "sucesso") {
            nivel++;
            carregarNivel(true);
        } else if (estadoMenu === "fracasso") {
            carregarNivel(true);
        }
    }
});

// --- Loop de animação de fundo (roda sempre, mesmo parado) ---
// Isso mantém as estrelas pulsando e as estrelas cadentes passando
function loopAnimacaoFundo() {
    // Só redesenha se NÃO está executando (para não conflitar com loopDeFisica)
    if (!executando) {
        desenhar();
    }
    requestAnimationFrame(loopAnimacaoFundo);
}

// Inicia tudo!
// Garante que a introdução apareça ao carregar a página
introOverlay.style.display = "flex";

atualizarPaginaIntro();  // Configura a primeira página da intro
carregarNivel();          // Carrega o nível 1
loopAnimacaoFundo();      // Inicia animação de fundo contínua
