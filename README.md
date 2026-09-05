# Instagram Scraper

Script para extrair dados de seguidores do Instagram e gerar listas de contato (WhatsApp).

## Requisitos

- Node.js 14+
- npm

## Instalação

```bash
npm install
```

## Configuração

1. Copie o arquivo de exemplo de cookies:
```bash
cp instagram_cookies.example.json instagram_cookies.json
```

2. Configure seus cookies do Instagram no arquivo `instagram_cookies.json`. Para obter os cookies:
   - Abra o Instagram no navegador
   - Abra as Developer Tools (F12)
   - Vá para Storage > Cookies > instagram.com
   - Copie os valores dos cookies necessários (principalmente `sessionid`)
   - Cole no arquivo `instagram_cookies.json`

3. Edite o arquivo `index-melhorias.js` e configure:
   - `perfilAlvo`: O perfil do Instagram que deseja scrape
   - `maxSeguidores`: Quantidade máxima de seguidores a extrair
   - `delayEntrePerfis`: Delay em milissegundos entre requisições

## Uso

```bash
node index-melhorias.js
```

O script gerará arquivos JSON na pasta `output/` com a lista de seguidores.

## Segurança

⚠️ **IMPORTANTE**: Nunca faça commit dos arquivos:
- `instagram_cookies.json` (contém dados de autenticação)
- `output/` (contém dados coletados)
- `chrome/` (dados do navegador)

Estes arquivos estão no `.gitignore` para proteger seus dados pessoais.

## Aviso Legal

Este script é apenas para fins educacionais. Verifique os Termos de Serviço do Instagram e as leis locais antes de usar.
