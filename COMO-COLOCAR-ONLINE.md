# Como colocar o site do Justiz & Co no ar (passo a passo para leigos)

Isso vai te dar um site com **domínio próprio**, gratuito, com os agendamentos
salvos de verdade em um banco de dados (Firebase), funcionando fora do Claude.

Vai levar uns 20-30 minutos na primeira vez. Depois disso, qualquer alteração
que eu fizer no código é só reenviar.

---

## Parte 1 — Criar o banco de dados (Firebase, gratuito)

1. Acesse **https://console.firebase.google.com** e faça login com uma conta Google.
2. Clique em **"Adicionar projeto"**. Dê um nome, ex: `justiz-co`. Pode desativar o
   Google Analytics (não é necessário). Clique em "Criar projeto".
3. No menu à esquerda, clique em **"Compilação" → "Firestore Database"**.
4. Clique em **"Criar banco de dados"**. Escolha a localização mais próxima
   (ex: `southamerica-east1` se estiver no Brasil). Escolha **"Iniciar no modo de teste"**.
   (Isso deixa o banco aberto por 30 dias — depois eu te ajudo a travar melhor, mas
   funciona normalmente enquanto isso.)
5. Ainda no Firebase, clique no ícone de **engrenagem ⚙️** (canto superior esquerdo) →
   **"Configurações do projeto"**.
6. Role até **"Seus aplicativos"** e clique no ícone **`</>`** (Web).
7. Dê um apelido ao app (ex: `site`) e clique em **"Registrar app"**.
8. O Firebase vai te mostrar um bloco de código parecido com isto:

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "justiz-co.firebaseapp.com",
     projectId: "justiz-co",
     storageBucket: "justiz-co.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```

   **Copie esse bloco inteiro.**

9. Abra o arquivo `src/firebase.js` deste projeto e **substitua** o objeto
   `firebaseConfig` pelo que você copiou. Salve o arquivo.

---

## Parte 2 — Subir o código para o GitHub

O Netlify precisa "puxar" o código de algum lugar para conseguir compilar
(o `.tsx`/`.jsx` sozinho não funciona nele, como você viu — ele precisa rodar
`npm install` e `npm run build` primeiro).

1. Crie uma conta gratuita em **https://github.com** (se ainda não tiver).
2. Clique em **"New repository"**, dê um nome (ex: `justiz-agendamento`),
   marque como **Private** ou **Public**, e clique em **"Create repository"**.
3. Na página do repositório vazio, clique em **"uploading an existing file"**.
4. Arraste **todos os arquivos e pastas deste projeto** para dentro da janela
   do navegador (exceto a pasta `node_modules`, se existir — ela não deve ir).
5. Clique em **"Commit changes"** para salvar o envio.

---

## Parte 3 — Conectar o GitHub ao Netlify

1. Acesse **https://app.netlify.com** e faça login (ou crie uma conta gratuita).
2. Clique em **"Add new site" → "Import an existing project"**.
3. Escolha **"Deploy with GitHub"** e autorize o acesso.
4. Selecione o repositório `justiz-agendamento` que você acabou de criar.
5. O Netlify já vai detectar as configurações automaticamente (por causa do
   arquivo `netlify.toml` incluído neste projeto):
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Clique em **"Deploy site"**. Aguarde 1-2 minutos.
7. Pronto — o Netlify te dá um link tipo `nome-aleatorio.netlify.app` já funcionando.

---

## Parte 4 — Colocar seu domínio próprio

1. Dentro do site no Netlify, vá em **"Domain settings" → "Add a domain"**.
2. Digite seu domínio (ex: `justizeco.com.br`) — se ainda não tiver um, dá pra
   comprar direto ali ou em registradores como Registro.br, GoDaddy, Hostinger.
3. O Netlify vai te dar registros DNS para configurar no lugar onde você
   comprou o domínio. Ele mostra o passo a passo específico pra cada caso.
4. Em algumas horas o certificado HTTPS é gerado automaticamente e o domínio
   passa a funcionar.

---

## Depois disso: como atualizar o site

Sempre que eu (Claude) alterar o código do app, você só precisa:
1. Baixar os arquivos atualizados.
2. Subir de novo no mesmo repositório do GitHub (substituindo os arquivos antigos).
3. O Netlify recompila e atualiza o site sozinho em cerca de 1 minuto.

---

## Sobre segurança (importante, mas não urgente)

O "modo de teste" do Firestore deixa o banco de dados aberto por 30 dias para
qualquer pessoa ler e escrever nele (não só pelo seu site — por qualquer
lugar que souber a chave do projeto). Isso é normal para começar, mas depois
que o site estiver no ar, me avise para eu te passar regras de segurança mais
restritas (Firestore Rules) para colar no console do Firebase, travando quem
pode alterar reservas e configurações.
