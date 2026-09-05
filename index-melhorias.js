const puppeteer = require('puppeteer');
const fs = require('fs');
const readline = require('readline');

const CONFIG = {
    perfilAlvo: 'thaynanvargas',
    maxSeguidores: 40000,
    delayEntrePerfis: 800,  // Reduzido de 2000 para 800
    delayAleatório: true,   // Simula comportamento humano
    usarGraphQL: true       // Usa API GraphQL para mais dados
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function delayAleatório(min = 800, max = 2500) {
    const tempo = Math.floor(Math.random() * (max - min + 1)) + min;
    return delay(tempo);
}

function obterUserAgent() {
    // Simula browser real
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

function perguntar(pergunta) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => {
        rl.question(pergunta, (resposta) => {
            rl.close();
            resolve(resposta);
        });
    });
}

function extrairUrlReal(urlInstagram) {
    try {
        if (urlInstagram.includes('l.instagram.com')) {
            const urlObj = new URL(urlInstagram);
            const urlCodificada = urlObj.searchParams.get('u');
            if (urlCodificada) return decodeURIComponent(urlCodificada).split('?')[0];
        }
        return urlInstagram;
    } catch (e) { return urlInstagram; }
}

// Verifica se é padrão de WhatsApp (oficial ou não)
function ehWhatsApp(url) {
    const urlLower = url.toLowerCase();
    // Aceita qualquer padrão de WhatsApp
    return urlLower.includes('wa.me/') || 
           urlLower.includes('api.whatsapp.com') || 
           urlLower.includes('chat.whatsapp.com') ||
           urlLower.includes('whatsapp.com');
}

// Extrai números de telefone para WhatsApp (qualquer formato)
function extrairNumerosWhatsApp(texto) {
    // Padrões diversos de números de telefone brasileiros
    const padroes = [
        /\+55\d{2}9\d{8}(?!\d)/g,              // +5511999999999
        /\+55\s*\d{2}\s*9\d{4}[\-\s]?\d{4}/g,  // +55 11 9 9999-9999
        /\(\+?55\)\s*\d{2}\s*9\d{4}[\-\s]?\d{4}/g, // (+55) 11 9 9999-9999
        /\b\d{2}\s*9\d{4}[\-\s]?\d{4}\b/g,     // 11 99999-9999 (sem +55)
        /\(\d{2}\)\s*9\d{4}[\-\s]?\d{4}/g,     // (11) 99999-9999
        /\b9\d{4}[\-\s]?\d{4}\b/g              // 99999-9999 (apenas número)
    ];
    
    let numeros = [];
    padroes.forEach(padrao => {
        const matches = texto.match(padrao);
        if (matches) numeros.push(...matches);
    });
    
    // Normalizar números: remover espaços/hífen, manter apenas números e +
    return [...new Set(numeros)].map(num => {
        let normalizado = num.replace(/[\s\-\(\)]/g, '');
        
        // Se não tem +55, adicionar
        if (!normalizado.startsWith('+55') && !normalizado.startsWith('55')) {
            // Se começar com 0, remover
            if (normalizado.startsWith('0')) {
                normalizado = normalizado.substring(1);
            }
            // Se tiver 11 dígitos (sem código país), adicionar 55
            if (normalizado.length === 11) {
                normalizado = '55' + normalizado;
            }
        }
        
        // Garantir que tenha +55
        if (!normalizado.startsWith('+')) {
            normalizado = '+' + normalizado;
        }
        
        return normalizado;
    }).filter(num => {
        // Validar: deve ter pelo menos +55 + DDD + número
        return num.length >= 12;
    });
}

// 🆕 Verifica se o arquivo de controle existe
function verificarArquivoControle() {
    const caminho = 'AVANCAR.txt';
    if (fs.existsSync(caminho)) {
        fs.unlinkSync(caminho); // Remove o arquivo
        return true;
    }
    return false;
}

// 🆕 Verifica se tem lista de seguidores salva
function verificarSeguidoresSalvos() {
    if (!fs.existsSync('output')) return null;
    const arquivos = fs.readdirSync('output');
    const arquivosSeguidores = arquivos.filter(f => 
        f.startsWith(`seguidores_${CONFIG.perfilAlvo}_`) && f.endsWith('.json')
    );
    if (arquivosSeguidores.length === 0) return null;
    return `output/${arquivosSeguidores.sort().reverse()[0]}`;
}

function verificarProgressoWhatsApp() {
    if (!fs.existsSync('output')) return null;
    const arquivos = fs.readdirSync('output');
    const arquivosProgresso = arquivos.filter(f => 
        f.startsWith(`whatsapp_${CONFIG.perfilAlvo}_`) && f.endsWith('.txt')
    );
    if (arquivosProgresso.length === 0) return null;
    return `output/${arquivosProgresso.sort().reverse()[0]}`;
}

function carregarProcessados(arquivoProgresso) {
    if (!fs.existsSync(arquivoProgresso)) {
        return { comWhatsApp: [], semWhatsApp: [], processados: new Set() };
    }
    const conteudo = fs.readFileSync(arquivoProgresso, 'utf8');
    const linhas = conteudo.split('\n');
    const comWhatsApp = [];
    const semWhatsApp = [];
    const processados = new Set();
    let secaoSemWhatsApp = false;
    
    for (let linha of linhas) {
        linha = linha.trim();
        if (!linha) continue;
        if (linha === '--- SEM WHATSAPP ---') { secaoSemWhatsApp = true; continue; }
        if (!secaoSemWhatsApp) {
            comWhatsApp.push(linha);
            const match = linha.match(/^@([\w.]+)/);
            if (match) processados.add(match[1]);
        } else {
            semWhatsApp.push(linha);
            const match = linha.match(/^@([\w.]+)/);
            if (match) processados.add(match[1]);
        }
    }
    return { comWhatsApp, semWhatsApp, processados };
}

async function scrollAgressivo(page) {
    await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return;
        const divs = dialog.querySelectorAll('div');
        for (let div of divs) {
            if (div.scrollHeight > div.clientHeight && div.clientHeight > 200) {
                // Scroll único e rápido
                div.scrollTop = div.scrollHeight;
                div.dispatchEvent(new Event('scroll', { bubbles: true }));
                break;
            }
        }
    });
    
    await delay(600); // Reduzido de 1500 para 600
}

// Nova função: Scroll rápido e eficiente
async function scrollComObserver(page) {
    await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        if (!dialog) return;
        const divScroll = Array.from(dialog.querySelectorAll('div')).find(
            d => d.scrollHeight > d.clientHeight && d.clientHeight > 200
        );
        if (divScroll) {
            divScroll.scrollTop = divScroll.scrollHeight;
            divScroll.dispatchEvent(new Event('scroll', { bubbles: true }));
        }
    });
    
    await delay(400); // Reduzido de 1200 para 400
}

// GraphQL como alternativa (se UI web bloquear)
async function tentarExtrairViaGraphQL(page, username) {
    try {
        const resultado = await page.evaluate(async (user) => {
            try {
                const response = await fetch(`https://www.instagram.com/web/search/topsearch/?query=${user}`);
                const data = await response.json();
                if (data?.users?.[0]?.id) {
                    return data.users[0].id;
                }
            } catch(e) {}
            return null;
        }, username);
        return resultado;
    } catch(e) {
        return null;
    }
}

async function extrairLinksBio(page, username) {
    try {
        // Timeout mais curto para performance
        await Promise.race([
            page.goto(`https://www.instagram.com/${username}/`, {
                waitUntil: 'networkidle2', timeout: 12000
            }),
            delay(10000)
        ]).catch(() => {});
        
        // Extrair PRIMEIRO - sem expandir (links já expostos)
        let bioInfo = await page.evaluate(() => {
            const header = document.querySelector('header');
            if (!header) return { linksWhatsApp: [], bio: '', temWhatsApp: false, temExpandir: false };
            
            // EXTRAIR BIO COMPLETA
            let bioTexto = header.textContent || '';
            const linksWhatsApp = [];
            const numeros = [];
            
            // 1️⃣ EXTRAIR LINKS DE WHATSAPP DAS <a> TAGS
            header.querySelectorAll('a[href]').forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    const hrefLower = href.toLowerCase();
                    // Aceita qualquer padrão de WhatsApp
                    if (hrefLower.includes('wa.me') || 
                        hrefLower.includes('whatsapp.com') || 
                        hrefLower.includes('api.whatsapp') || 
                        hrefLower.includes('chat.whatsapp')) {
                        const val = href.trim();
                        if (val && !linksWhatsApp.includes(val)) {
                            linksWhatsApp.push(val);
                        }
                    }
                }
            });
            
            // 2️⃣ EXTRAIR LINKS WA.ME DIRETAMENTE DO TEXTO (mesmo sem <a> tag)
            const regexWaMeTexto = /wa\.me\/\d+/gi;
            const matchesWaMe = bioTexto.match(regexWaMeTexto);
            if (matchesWaMe) {
                matchesWaMe.forEach(match => {
                    const linkCompleto = 'https://' + match.trim().toLowerCase();
                    if (!linksWhatsApp.includes(linkCompleto)) {
                        linksWhatsApp.push(linkCompleto);
                    }
                });
            }
            
            // 3️⃣ EXTRAIR OUTRAS URLs WHATSAPP DO TEXTO
            const regexUrlsWhatsApp = /(https?:\/\/)?(?:api\.)?whatsapp\.com\S+|https?:\/\/chat\.whatsapp\.com\S+/gi;
            const matchesUrls = bioTexto.match(regexUrlsWhatsApp);
            if (matchesUrls) {
                matchesUrls.forEach(match => {
                    const urlLimpa = match.replace(/[.,;:!?)\]]+$/, '').trim();
                    if (urlLimpa && !linksWhatsApp.includes(urlLimpa)) {
                        linksWhatsApp.push(urlLimpa);
                    }
                });
            }
            
            // 4️⃣ EXTRAIR NÚMEROS DE TELEFONE (qualquer formato, sem validação de contexto)
            const padroesTelefone = [
                /\+55\d{2}9\d{8}(?!\d)/g,              // +5521999999999
                /\+55\s*\d{2}\s*9\d{4}[\-\s]?\d{4}/g,  // +55 21 9 9999-9999
                /\(\+?55\)\s*\d{2}\s*9\d{4}[\-\s]?\d{4}/g, // (+55) 21 9 9999-9999
                /\b\d{2}\s*9\d{4}[\-\s]?\d{4}\b/g,     // 21 99999-9999
                /\(\d{2}\)\s*9\d{4}[\-\s]?\d{4}/g,     // (21) 99999-9999
                /\b9\d{4}[\-\s]?\d{4}\b/g              // 99999-9999
            ];
            
            padroesTelefone.forEach(padrao => {
                const matches = bioTexto.match(padrao);
                if (matches) {
                    matches.forEach(match => {
                        let normalizado = match.replace(/[\s\-\(\)]/g, '');
                        
                        // Se não tem +55, adicionar
                        if (!normalizado.startsWith('+55') && !normalizado.startsWith('55')) {
                            if (normalizado.startsWith('0')) {
                                normalizado = normalizado.substring(1);
                            }
                            if (normalizado.length === 11) {
                                normalizado = '55' + normalizado;
                            }
                        }
                        
                        // Garantir que tenha +
                        if (!normalizado.startsWith('+')) {
                            normalizado = '+' + normalizado;
                        }
                        
                        if (normalizado.length >= 12 && !numeros.includes(normalizado)) {
                            numeros.push(normalizado);
                        }
                    });
                }
            });
            
            // 5️⃣ VERIFICAR SE HÁ "..." PARA EXPANDIR
            const temExpandir = bioTexto.includes('…') || bioTexto.includes('...');
            
            return { 
                linksWhatsApp: linksWhatsApp,
                numeros: numeros,
                bio: bioTexto,
                temWhatsApp: linksWhatsApp.length > 0 || numeros.length > 0,
                temExpandir: temExpandir
            };
        });
        
        // Se não encontrou contatos e há "..." para expandir, tenta expandir
        if (bioInfo.linksWhatsApp.length === 0 && bioInfo.numeros.length === 0 && bioInfo.temExpandir) {
            const clicou = await page.evaluate(() => {
                const header = document.querySelector('header');
                if (!header) return false;
                const elementos = header.querySelectorAll('button, span[role="button"], div[role="button"]');
                for (let el of elementos) {
                    const texto = el.textContent?.trim() || '';
                    if (texto === '…' || texto === '...' || texto === 'mais' || texto === 'Mais') {
                        if (el.offsetParent !== null) { // Verificar se é visível
                            el.click();
                            return true;
                        }
                    }
                }
                return false;
            });
            
            if (clicou) {
                // Espera curto apenas se necessário
                await delay(600);
                
                // Extrair novamente após expansão
                bioInfo = await page.evaluate(() => {
                    const header = document.querySelector('header');
                    if (!header) return { linksWhatsApp: [], numeros: [], bio: '', temWhatsApp: false };
                    
                    let bioTexto = header.textContent || '';
                    const linksWhatsApp = [];
                    const numeros = [];
                    
                    // REFAZER EXTRAÇÃO DE LINKS WHATSAPP APÓS EXPANSÃO
                    header.querySelectorAll('a[href]').forEach(link => {
                        const href = link.getAttribute('href');
                        if (href) {
                            const hrefLower = href.toLowerCase();
                            if (hrefLower.includes('wa.me') || 
                                hrefLower.includes('whatsapp.com') || 
                                hrefLower.includes('api.whatsapp') || 
                                hrefLower.includes('chat.whatsapp')) {
                                const val = href.trim();
                                if (val && !linksWhatsApp.includes(val)) {
                                    linksWhatsApp.push(val);
                                }
                            }
                        }
                    });
                    
                    // Extrair wa.me do texto
                    const regexWaMeTexto = /wa\.me\/\d+/gi;
                    const matchesWaMe = bioTexto.match(regexWaMeTexto);
                    if (matchesWaMe) {
                        matchesWaMe.forEach(match => {
                            const linkCompleto = 'https://' + match.trim().toLowerCase();
                            if (!linksWhatsApp.includes(linkCompleto)) {
                                linksWhatsApp.push(linkCompleto);
                            }
                        });
                    }
                    
                    // Extrair outras URLs WhatsApp do texto
                    const regexUrlsWhatsApp = /(https?:\/\/)?(?:api\.)?whatsapp\.com\S+|https?:\/\/chat\.whatsapp\.com\S+/gi;
                    const matchesUrls = bioTexto.match(regexUrlsWhatsApp);
                    if (matchesUrls) {
                        matchesUrls.forEach(match => {
                            const urlLimpa = match.replace(/[.,;:!?)\]]+$/, '').trim();
                            if (urlLimpa && !linksWhatsApp.includes(urlLimpa)) {
                                linksWhatsApp.push(urlLimpa);
                            }
                        });
                    }
                    
                    // Extrair números de qualquer formato
                    const padroesTelefone = [
                        /\+55\d{2}9\d{8}(?!\d)/g,
                        /\+55\s*\d{2}\s*9\d{4}[\-\s]?\d{4}/g,
                        /\(\+?55\)\s*\d{2}\s*9\d{4}[\-\s]?\d{4}/g,
                        /\b\d{2}\s*9\d{4}[\-\s]?\d{4}\b/g,
                        /\(\d{2}\)\s*9\d{4}[\-\s]?\d{4}/g,
                        /\b9\d{4}[\-\s]?\d{4}\b/g
                    ];
                    
                    padroesTelefone.forEach(padrao => {
                        const matches = bioTexto.match(padrao);
                        if (matches) {
                            matches.forEach(match => {
                                let normalizado = match.replace(/[\s\-\(\)]/g, '');
                                
                                if (!normalizado.startsWith('+55') && !normalizado.startsWith('55')) {
                                    if (normalizado.startsWith('0')) {
                                        normalizado = normalizado.substring(1);
                                    }
                                    if (normalizado.length === 11) {
                                        normalizado = '55' + normalizado;
                                    }
                                }
                                
                                if (!normalizado.startsWith('+')) {
                                    normalizado = '+' + normalizado;
                                }
                                
                                if (normalizado.length >= 12 && !numeros.includes(normalizado)) {
                                    numeros.push(normalizado);
                                }
                            });
                        }
                    });
                    
                    return { 
                        linksWhatsApp: linksWhatsApp,
                        numeros: numeros,
                        bio: bioTexto,
                        temWhatsApp: linksWhatsApp.length > 0 || numeros.length > 0
                    };
                });
            }
        }
        
        // COMPILAR CONTATOS WHATSAPP FINAIS
        const contatosFinais = [];
        
        // Adicionar links de WhatsApp diretos
        bioInfo.linksWhatsApp.forEach(link => {
            const linkProcessado = extrairUrlReal(link);
            if (linkProcessado && !contatosFinais.includes(linkProcessado)) {
                contatosFinais.push(linkProcessado);
            }
        });
        
        // Adicionar números de telefone encontrados como links wa.me
        bioInfo.numeros.forEach(numero => {
            const linkWhatsApp = `https://wa.me/${numero}`;
            if (!contatosFinais.includes(linkWhatsApp)) {
                contatosFinais.push(linkWhatsApp);
            }
        });
        
        return { 
            username, 
            links: [...new Set(contatosFinais)], 
            temWhatsApp: contatosFinais.length > 0 || bioInfo.temWhatsApp,
            bioCompleta: bioInfo.bio
        };
    } catch (erro) {
        return { username, links: [], temWhatsApp: false, bioCompleta: '' };
    }
}

async function verificarWhatsApp(page, listaSeguidores, arquivoSaida, comWhatsApp, semWhatsApp, processadosAnteriores) {
    console.log('\n' + '='.repeat(60));
    console.log('📱 INICIANDO VERIFICAÇÃO DE WHATSAPP');
    console.log('='.repeat(60) + '\n');
    
    let listaParaVerificar = [...listaSeguidores];
    if (processadosAnteriores.size > 0) {
        const antes = listaParaVerificar.length;
        listaParaVerificar = listaParaVerificar.filter(u => !processadosAnteriores.has(u));
        console.log(`⏭️  Pulando ${antes - listaParaVerificar.length} já processados`);
    }
    
    console.log(`📊 Total para verificar: ${listaParaVerificar.length}\n`);
    
    if (listaParaVerificar.length === 0) {
        console.log('✅ Todos já foram processados!');
        return { comWhatsApp, semWhatsApp };
    }
    
    console.log('⚡ Processando perfis com performance otimizada\n');
    
    if (!fs.existsSync('output')) fs.mkdirSync('output');
    
    const tempoInicio = Date.now();
    
    for (let i = 0; i < listaParaVerificar.length; i++) {
        const username = listaParaVerificar[i];
        const total = listaParaVerificar.length;
        const num = (i + 1).toString().padStart(5, '0');
        
        process.stdout.write(`[${num}/${total}] @${username}... `);
        
        const resultado = await extrairLinksBio(page, username);
        
        if (resultado.temWhatsApp && resultado.links.length > 0) {
            let linhaCompleta = `@${resultado.username}`;
            
            // Adicionar contatos de WhatsApp encontrados
            if (resultado.links.length > 0) {
                linhaCompleta += ` - ${resultado.links.join(' | ')}`;
            }
            
            comWhatsApp.push(linhaCompleta);
            const preview = resultado.links[0]?.substring(0, 60) || 'WhatsApp';
            console.log(`✅ ${preview}`);
        } else {
            semWhatsApp.push(`@${resultado.username}`);
            console.log('❌');
        }
        
        const conteudo = [
            ...comWhatsApp,
            '',
            '--- SEM WHATSAPP ---',
            ...semWhatsApp
        ].join('\n');
        
        fs.writeFileSync(arquivoSaida, conteudo);
        
        // Status a cada 15 perfis (mais rápido que 10)
        if ((i + 1) % 15 === 0 && (i + 1) < listaParaVerificar.length) {
            const pct = Math.round((i + 1) / listaParaVerificar.length * 100);
            const tempoDecorrido = Math.round((Date.now() - tempoInicio) / 1000);
            const tempoMedio = tempoDecorrido / (i + 1);
            const tempoRestante = Math.round((listaParaVerificar.length - i - 1) * tempoMedio);
            console.log(`⏱️  ${pct}% | ✅ ${comWhatsApp.length} | ❌ ${semWhatsApp.length} | ~${tempoRestante}s restantes\n`);
            await delay(1500); // Reduzido de 3000 para 1500
        }
    }
    
    const tempoTotal = Math.round((Date.now() - tempoInicio) / 1000);
    const mediaSegundo = (listaParaVerificar.length / tempoTotal).toFixed(2);
    console.log(`\n⚡ Tempo total: ${tempoTotal}s | Média: ${mediaSegundo} perfis/segundo\n`);
    
    return { comWhatsApp, semWhatsApp };
}

async function extrairSeguidoresComWhatsApp() {
    console.log('='.repeat(60));
    console.log('🤖 EXTRATOR DE WHATSAPP');
    console.log('='.repeat(60) + '\n');
    
    // 🆕 Verifica se AVANCAR.txt existe no início para pular seguidores
    let pularSeguidores = false;
    let listaSeguidoresRecuperada = [];
    
    if (fs.existsSync('AVANCAR.txt')) {
        console.log('⏩ Detectado AVANCAR.txt - Pulando extração de seguidores\n');
        const arquivoSeguidores = verificarSeguidoresSalvos();
        if (arquivoSeguidores) {
            console.log(`📂 Usando lista salva: ${arquivoSeguidores}\n`);
            const dados = JSON.parse(fs.readFileSync(arquivoSeguidores, 'utf8'));
            listaSeguidoresRecuperada = dados.seguidores.map(u => u.replace('@', ''));
            pularSeguidores = true;
            fs.unlinkSync('AVANCAR.txt');
        } else {
            console.log('⚠️  Nenhuma lista de seguidores salva encontrada\n');
            console.log('💡 Salve os seguidores primeiro antes de usar AVANCAR.txt\n');
            fs.unlinkSync('AVANCAR.txt');
            return;
        }
    }
    
    console.log('💡 Crie um arquivo "AVANCAR.txt" na pasta do projeto');
    console.log('   para PARAR extração e IR para WhatsApp');
    console.log('💡 Comando rápido: echo > AVANCAR.txt\n');
    
    const arquivoWhatsApp = verificarProgressoWhatsApp();
    
    let comWhatsApp = [];
    let semWhatsApp = [];
    let processadosAnteriores = new Set();
    let arquivoSaida = '';
    
    if (arquivoWhatsApp) {
        console.log(`📂 Progresso anterior: ${arquivoWhatsApp}\n`);
        const dados = carregarProcessados(arquivoWhatsApp);
        console.log(`📊 Já processados: ${dados.processados.size}`);
        console.log(`   ✅ ${dados.comWhatsApp.length} com WhatsApp`);
        console.log(`   ❌ ${dados.semWhatsApp.length} sem WhatsApp\n`);
        const escolha = await perguntar('👉 CONTINUAR de onde parou? (s/n): ');
        if (escolha.toLowerCase() === 's') {
            comWhatsApp = dados.comWhatsApp;
            semWhatsApp = dados.semWhatsApp;
            processadosAnteriores = dados.processados;
            arquivoSaida = arquivoWhatsApp;
            console.log('✅ Continuando...\n');
        } else {
            console.log('🔄 Iniciando do zero...\n');
        }
    }
    
    if (!arquivoSaida) {
        arquivoSaida = `output/whatsapp_${CONFIG.perfilAlvo}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    }
    
    // Buscar o Chrome instalado pelo puppeteer
    let executablePath;
    try {
        const browserFetcher = puppeteer.createBrowserFetcher();
        const revisions = await browserFetcher.localRevisions();
        if (revisions.length > 0) {
            executablePath = browserFetcher.revisionInfo(revisions[0]).executablePath;
        }
    } catch (e) {
        console.log('⚠️  Tentando encontrar Chrome instalado...');
    }
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: executablePath,
        args: [
            '--no-sandbox',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
        defaultViewport: null
    });
    const page = await browser.newPage();
    
    // Adicionar headers reais
    await page.setUserAgent(obterUserAgent());
    await page.setViewport({ width: 1366, height: 768 });
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    });
    
    // 🆕 Carregar cookies salvos se existirem
    const arquivoCookies = 'instagram_cookies.json';
    let cookiesCarregados = false;
    if (fs.existsSync(arquivoCookies)) {
        try {
            const cookies = JSON.parse(fs.readFileSync(arquivoCookies, 'utf8'));
            await page.setCookie(...cookies);
            cookiesCarregados = true;
            console.log('✅ Cookies recuperados - Sessão restaurada\n');
        } catch (e) {
            console.log('⚠️  Cookies inválidos - Será necessário fazer login\n');
        }
    }
    
    // Remove arquivo de controle se existir
    if (fs.existsSync('AVANCAR.txt')) fs.unlinkSync('AVANCAR.txt');
    
    try {
        // 🆕 Se pulou seguidores, vai direto para WhatsApp
        if (pularSeguidores) {
            console.log(`✅ Usando ${listaSeguidoresRecuperada.length} seguidores salvos\n`);
            
            // Se tem cookies, tenta acessar o perfil direto
            if (cookiesCarregados) {
                console.log('🚀 Acessando com sessão salva...\n');
                await page.goto(`https://www.instagram.com/${CONFIG.perfilAlvo}/`, { waitUntil: 'domcontentloaded' });
            } else {
                console.log('📱 Abrindo Instagram...');
                await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
                console.log('\n⚠️  FAÇA LOGIN MANUAL\n');
                await perguntar('👉 ENTER depois de logar...');
                
                // 🆕 Salvar cookies após login
                const cookies = await page.cookies();
                fs.writeFileSync(arquivoCookies, JSON.stringify(cookies, null, 2));
                console.log('\n✅ Cookies salvos!\n');
            }
            
            await delay(1500);
            
            const resultado = await verificarWhatsApp(
                page, 
                listaSeguidoresRecuperada, 
                arquivoSaida, 
                comWhatsApp, 
                semWhatsApp, 
                processadosAnteriores
            );
            
            comWhatsApp = resultado.comWhatsApp;
            semWhatsApp = resultado.semWhatsApp;
            
            console.log('\n' + '='.repeat(60));
            console.log('📊 RESUMO');
            console.log('='.repeat(60));
            console.log(`👥 ${listaSeguidoresRecuperada.length} | ✅ ${comWhatsApp.length} | ❌ ${semWhatsApp.length}`);
            console.log(`💾 ${arquivoSaida}`);
            console.log('='.repeat(60));
            
            console.log('\n');
            await perguntar('👉 ENTER para fechar...');
            await browser.close();
            console.log('👋 Finalizado!');
            return;
        }
        
        console.log('📱 Abrindo Instagram...');
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
        console.log('\n⚠️  FAÇA LOGIN MANUAL\n');
        await perguntar('👉 ENTER depois de logar...');
        await delay(1500); // Reduzido de 3000
        
        // 🆕 Salvar cookies após login
        const cookies = await page.cookies();
        fs.writeFileSync(arquivoCookies, JSON.stringify(cookies, null, 2));
        console.log('\n✅ Cookies salvos!\n');
        
        try {
            const botoes = await page.$x("//button[contains(text(), 'Agora não')]");
            for (let btn of botoes) { await btn.click(); await delay(300); } // Reduzido de 500
        } catch(e) {}
        
        console.log(`\n🎯 @${CONFIG.perfilAlvo}...`);
        await page.goto(`https://www.instagram.com/${CONFIG.perfilAlvo}/`, { waitUntil: 'domcontentloaded' });
        await delay(2500); // Reduzido de 4000
        
        console.log('📊 Abrindo seguidores...');
        let clicou = await page.evaluate(() => {
            const links = document.querySelectorAll('a');
            for (let link of links) {
                if (link.href && link.href.includes('/followers/')) { link.click(); return true; }
            }
            return false;
        });
        if (!clicou) await perguntar('👉 Clique em "seguidores" e ENTER...');
        await delay(2500); // Reduzido de 4000
        
        console.log('🔍 Expandindo...');
        let expandiu = await page.evaluate(() => {
            const dialog = document.querySelector('[role="dialog"]');
            if (!dialog) return false;
            for (let el of dialog.querySelectorAll('*')) {
                const t = el.textContent?.trim() || '';
                if ((t.includes('Ver mais') || t.includes('Show more')) && 
                    (el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.getAttribute('role') === 'button')) {
                    el.click(); return true;
                }
            }
            return false;
        });
        if (!expandiu) await perguntar('👉 Clique em "Ver mais" e ENTER...');
        await delay(1500); // Reduzido de 3000
        
        console.log('\n📝 Extraindo seguidores...');
        console.log('💡 Crie arquivo AVANCAR.txt para ir para WhatsApp\n');
        
        const seguidores = new Set();
        let avancar = false;
        let tentativasSemNovosSeguidor = 0;
        const MAX_TENTATIVAS_SEM_NOVO = 12; // Aumentado para 12
        let ultimoTamanho = 0;
        let bloqueioDetectado = false;
        
        while (seguidores.size < CONFIG.maxSeguidores && !avancar && !bloqueioDetectado) {
            
            const novosSeguidores = await page.evaluate(() => {
                const dialog = document.querySelector('[role="dialog"]');
                if (!dialog) return [];
                const resultados = new Set();
                
                // Método 1: Buscar por href de perfil
                dialog.querySelectorAll('a[href^="/"]').forEach(link => {
                    const href = link.getAttribute('href');
                    const match = href?.match(/^\/([^\/\?]+)\/$/);
                    if (match && match[1] && !['explore','reel','stories','p','tv','reels','hashtag'].includes(match[1])) {
                        resultados.add(match[1]);
                    }
                });
                
                // Método 2: Extrair de span/div com padrão username
                dialog.querySelectorAll('span, div').forEach(el => {
                    const texto = el.textContent?.trim();
                    if (texto && texto.match(/^[a-zA-Z0-9._]{3,}$/) && 
                        !['Direct','Explorerar','Buscar','Search','Seguidores','Followers'].includes(texto)) {
                        resultados.add(texto);
                    }
                });
                
                return Array.from(resultados);
            });
            
            const antes = seguidores.size;
            novosSeguidores.forEach(u => {
                if (u && u.length > 2 && !u.includes('?')) {
                    seguidores.add(u);
                }
            });
            const adicionados = seguidores.size - antes;
            
            console.log(`📈 ${seguidores.size} seguidores [+${adicionados}]`);
            
            // Detecção de bloqueio: se ficou igual 3 vezes = Instagram bloqueou
            if (adicionados === 0) {
                tentativasSemNovosSeguidor++;
                
                if (tentativasSemNovosSeguidor === 3) {
                    console.log('\n⚠️  AVISO: Instagram pode estar BLOQUEANDO');
                    console.log('💡 Tente: mudar de conta, usar proxy, ou fazer login real');
                }
                
                if (tentativasSemNovosSeguidor >= MAX_TENTATIVAS_SEM_NOVO) {
                    console.log('\n✅ Limite atingido - seguidores carregados: ' + seguidores.size);
                    console.log('⚠️  Nota: Instagram limita UI web a ~7-8 mil seguidores');
                    console.log('   Para mais dados, use a API ou GraphQL\n');
                    break;
                }
                
                console.log(`⚠️  ${tentativasSemNovosSeguidor}/${MAX_TENTATIVAS_SEM_NOVO} - tentando scroll...`);
                
                await scrollAgressivo(page);
                await delayAleatório(800, 1200); // Reduzido significativamente
            } else {
                tentativasSemNovosSeguidor = 0;
                await scrollAgressivo(page);
                await delayAleatório(600, 900); // Reduzido significativamente
            }
            
            // Verifica arquivo de controle
            if (verificarArquivoControle()) {
                console.log('\n⚠️  Arquivo AVANCAR.txt detectado!');
                console.log('⏹️  Parando extração...');
                console.log('➡️  Indo para WhatsApp...\n');
                avancar = true;
                break;
            }
        }
        
        // Limpar lista
        const listaSeguidores = Array.from(seguidores)
            .filter(u => u.length > 2 && !u.includes('?') && !u.includes('#'))
            .map(u => u.replace(/Verificado$/i, ''))
            .filter((u, i, arr) => arr.indexOf(u) === i);
        
        console.log(`✅ ${listaSeguidores.length} seguidores ÚNICOS extraídos`);
        
        if (listaSeguidores.length >= 6500) {
            console.log('\n⚠️  INFORMAÇÃO: Instagram limita UI web a ~7-8 mil seguidores');
            console.log('   Motivos: proteção anti-scraping, limite de renderização');
            console.log('   Soluções:');
            console.log('   • Usar dados já extraídos (os mais ativos aparecem primeiro)');
            console.log('   • Usar conta oficial/partnership com Instagram');
            console.log('   • Usar ferramentas pagas com acesso à API privada\n');
        }
        
        // Salvar lista
        const tsSeg = new Date().toISOString().replace(/[:.]/g, '-');
        const arqSeg = `output/seguidores_${CONFIG.perfilAlvo}_${tsSeg}.json`;
        if (!fs.existsSync('output')) fs.mkdirSync('output');
        fs.writeFileSync(arqSeg, JSON.stringify({
            perfil: CONFIG.perfilAlvo,
            data: new Date().toISOString(),
            total: listaSeguidores.length,
            seguidores: listaSeguidores.map(u => '@' + u)
        }, null, 2));
        console.log(`💾 Lista: ${arqSeg}\n`);
        
        // Verificar WhatsApp
        const resultado = await verificarWhatsApp(
            page, 
            listaSeguidores, 
            arquivoSaida, 
            comWhatsApp, 
            semWhatsApp, 
            processadosAnteriores
        );
        
        comWhatsApp = resultado.comWhatsApp;
        semWhatsApp = resultado.semWhatsApp;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 RESUMO');
        console.log('='.repeat(60));
        console.log(`👥 ${listaSeguidores.length} | ✅ ${comWhatsApp.length} | ❌ ${semWhatsApp.length}`);
        console.log(`💾 ${arquivoSaida}`);
        console.log('='.repeat(60));
        
    } catch (erro) {
        console.error('\n❌', erro.message);
    } finally {
        console.log('\n');
        await perguntar('👉 ENTER para fechar...');
        await browser.close();
        console.log('👋 Finalizado!');
    }
}

extrairSeguidoresComWhatsApp();