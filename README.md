# iFute

Plataforma para organizar peladas entre amigos com controle de convocações (mensalistas) e vagas para avulsos. O MVP usa FastAPI + SQLite no backend e React + Vite no frontend.

## Principais recursos

- Cadastro/login com papéis (`superadmin`, `admin` e `user`) e autenticação JWT.
- Controle de permissões: superadmins criam grupos e convidam novos admins; admins gerenciam apenas os recursos do seu grupo; usuários interagem apenas com partidas do próprio grupo.
- Administradores criam partidas, definem número de vagas e selecionam convocados.
- Convocados confirmam ou recusam presença; vagas não confirmadas até o prazo ficam disponíveis para avulsos.
- Convocados que voltam a confirmar retomam a vaga automaticamente, deslocando o último avulso confirmado para a fila.
- Avulsos só ocupam vagas livres; nunca substituem convocados confirmados.
- Avulsos podem entrar em lista de espera e são promovidos automaticamente quando sobram vagas.
- Perfil com foto e status (mensalista/avulso); apenas administradores podem alterar o status dos usuários.
- Listas de convocados, avulsos e fila exibem avatar + nome, facilitando identificar quem é quem.
- Painel detalhado mostra confirmados, pendentes, ausentes, avulsos e fila de espera.
- Admin pode reabrir vagas atualizando a lista de convocados ou removendo presenças.
- Admin pode, ao criar partidas, convocar automaticamente todos os usuários marcados como mensalistas.
- Admin envia convites em massa por e-mail e acompanha o status (pendente, aceito, expirado).
- Grupos centralizam usuários: cada jogador pertence a um grupo e as partidas futuras serão organizadas por grupo.
- Partidas pertencem a um único grupo; usuários só visualizam e participam das partidas do grupo em que estão.
- Convites enviados por administradores já vinculam automaticamente os novos usuários ao grupo correto.

## Estrutura do projeto

```
foundation/
├── backend/
│   ├── app/
│   │   ├── config.py            # variáveis de ambiente (JWT, prazos, admin default)
│   │   ├── crud.py              # regras de convocações, presenças, autenticação
│   │   ├── database.py          # engine + reset automático do schema
│   │   ├── main.py              # rotas FastAPI
│   │   ├── models.py            # User, Game, Convocation, Presence
│   │   ├── schemas.py           # modelos Pydantic
│   │   └── security.py          # hash, JWT e guardas de rota
│   ├── data/                    # banco SQLite (persistido via volume)
│   └── requirements.txt
├── frontend/
│   ├── package.json
│   └── src/
│       ├── api.js               # axios com interceptor de token
│       ├── context/AuthContext.jsx
│       ├── App.jsx, main.jsx, main.css
│       └── pages/               # CreateGame, GameDetail, GameList, Login, Register
└── docker-compose.yml
```

## Papéis e permissões

- `superadmin`: cria e gerencia grupos, além de enviar convites para novos administradores de grupos (`POST /superadmin/invitations`). Não participa diretamente dos jogos.
- `admin`: pode convidar usuários comuns para o próprio grupo, criar e administrar partidas do grupo, além de atualizar o status dos integrantes (`mensalista`/`avulso`).
- `user`: visualiza as partidas do próprio grupo, confirma presença como convocado ou participa como avulso/espera. Não consegue criar grupos nem partidas.

## Variáveis de ambiente

Backend (FastAPI):

- `DATABASE_URL` — caminho do SQLite (default `sqlite:///./data/app.db`).
- `JWT_SECRET` — chave usada para assinar tokens JWT.
- `TOKEN_EXPIRE_MINUTES` — duração dos tokens (minutos).
- `ADMIN_DEFAULT_USER` — opcional, formato `Nome,email,senha` para criar/promover admin no startup.
- `DEFAULT_CONVOCATION_DEADLINE_HOURS` — prazo padrão (em horas) para convocados confirmarem.
- `CORS_ALLOWED_ORIGINS`, `CORS_ALLOWED_REGEX`, `FRONTEND_ORIGIN` — ajustes finos de CORS.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — credenciais do servidor SMTP para envio de e-mails.
- `SMTP_STARTTLS` — define se deve usar STARTTLS (default `True`).
- `EMAIL_FROM` — remetente das notificações por e-mail.
- `FRONTEND_BASE_URL` — base usada nos links enviados por e-mail (default `http://localhost:3000`).
- `INVITATION_EXPIRE_HOURS` — validade (horas) para convites enviados (default 72).

Frontend (Vite):

- `VITE_API_BASE_URL` — URL base da API (default `http://localhost:8000`).

## Rodando localmente

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Swagger disponível em [http://localhost:8000/docs](http://localhost:8000/docs).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Interface em [http://localhost:3000](http://localhost:3000).

## Docker

```bash
docker-compose up --build
```

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend/Swagger: [http://localhost:8000/docs](http://localhost:8000/docs)

O SQLite é persistido em `backend/data` (bind mount).

## Fluxo de convocações

1. **Admin cria partida** informando data, local, vagas totais e selecionando os convocados. Se desejar, marca a opção de convocar automaticamente todos os mensalistas (eles entram como pendentes até confirmar).
2. O sistema define o prazo (`convocation_deadline`) com base no campo informado ou na variável `DEFAULT_CONVOCATION_DEADLINE_HOURS`.
3. Enquanto o prazo não expira, cada convocado mantém uma vaga reservada.
4. Convocado acessa a partida e escolhe **Confirmar** ou **Não vou** (`POST /games/{id}/confirm` ou `/decline`).
5. Caso decline (ou após o prazo sem confirmação), a vaga fica livre para avulsos (`POST /games/{id}/join`).
6. Avulsos só ocupam vagas realmente disponíveis (`available_slots`) e entram em lista de espera quando não houver vaga.
7. Sempre que uma vaga abrir (decline ou remoção), o primeiro da fila é promovido automaticamente. Se o convocado retomar a vaga depois, o último avulso confirmado volta para a fila, mantendo a ordem original (FIFO).
8. Se um avulso cancelar a própria inscrição (`DELETE /games/{id}/presences/{userId}`), ele sai definitivamente da fila e, se se inscrever novamente, entra ao final.
9. Admin pode atualizar a lista de convocados a qualquer momento (`POST /games/{id}/convocations`) ou remover presenças (`DELETE /games/{id}/presences/{userId}`).

## Fotos de perfil e status

- O upload da foto é feito via `POST /users/me/upload-photo` (multipart/form-data). O arquivo é salvo em `/uploads/` e a URL relativa é armazenada no campo `profile_image`.
- O frontend usa automaticamente essa URL para exibir avatares; se não houver foto, um placeholder é mostrado.
- Apenas administradores podem alterar o status (`mensalista` ou `avulso`) dos usuários por meio da interface `/admin/users` ou do endpoint `PATCH /admin/users/{id}/status`.
- Todas as listas de jogadores (confirmados, pendentes, avulsos e fila de espera) exibem o avatar ao lado do nome para facilitar a identificação.

## Convites em massa

- Administradores enviam convites com nome e e-mail via `/admin/invitations`. Cada convite recebe um token único e uma data de expiração.
- O e-mail contém um link para `/register?token=...`; o convidado define senha e dados opcionais (posição preferida) em `POST /auth/register-invited`.
- Convites expiram automaticamente após o prazo configurado; o backend marca o status como `expired` quando consultados.
- A listagem `/admin/invitations` retorna o histórico (pendente, aceito, expirado) para acompanhamento.

## Grupos

- Grupos são cadastrados via `POST /groups` e listados em `GET /groups`.
- Todo usuário precisa estar atrelado a um grupo no momento do cadastro (`group_id`).
- Partidas criadas (`POST /games`) recebem automaticamente o `group_id` do organizador e só aparecem para usuários do mesmo grupo quando consultadas em `GET /games` ou `GET /games/{id}`.
- O cadastro (convencional ou via convite) oferece um seletor de grupos disponíveis.
- Convites enviados por admins carregam o `group_id` do próprio administrador; ao concluir o cadastro o usuário já nasce no grupo indicado. No cadastro convencional, o grupo ainda é escolhido manualmente pelo próprio usuário.

## Endpoints principais

- `POST /auth/register` — cria usuário (role padrão `user`).
- `POST /auth/login` — autentica e retorna JWT (`username` = email).
- `GET /auth/me` — dados do usuário autenticado.
- `GET /auth/confirm` — confirma conta a partir do token enviado por e-mail.
- `POST /auth/forgot-password` — solicita redefinição de senha.
- `POST /auth/reset-password` — redefine senha a partir do token recebido por e-mail.
- `GET /users` — lista usuários do grupo do admin autenticado.
- `POST /games` — cria partida com lista inicial de convocados para o grupo do admin autenticado.
- `GET /games` — lista partidas do grupo do usuário logado com vagas disponíveis/reservadas.
- `GET /games/{id}` — detalhes completos das partidas do grupo do usuário autenticado.
- `POST /games/{id}/convocations` — redefine convocações (admin).
- `POST /games/{id}/confirm` — convocado confirma presença.
- `POST /games/{id}/decline` — convocado informa ausência.
- `POST /games/{id}/join` — avulso tenta entrar (apenas se houver vaga).
- `POST /users/me/upload-photo` — upload da foto de perfil do usuário autenticado.
- `PATCH /admin/users/{id}/status` — admin atualiza o status (mensalista/avulso) de um usuário.
- `POST /admin/invitations` — envia convites em massa para novos usuários do mesmo grupo do admin autenticado.
- `GET /admin/invitations` — lista convites enviados (filtrados pelo grupo do admin) e seus status.
- `GET /auth/invitations/{token}` — valida o token, informa o grupo associado e retorna dados pré-preenchidos.
- `POST /auth/register-invited` — conclui o cadastro de um convidado usando o grupo definido no convite.
- `GET /groups` — lista grupos disponíveis.
- `POST /groups` — cria um novo grupo (somente superadmin).
- `POST /superadmin/invitations` — envia convites para novos administradores vinculados a grupos existentes.
- `GET /superadmin/invitations` — lista convites de administradores com filtro opcional por grupo.
- `DELETE /games/{id}/presences/{userId}` — remove presença (auto ou admin).
- `DELETE /games/{id}` — remove partida (dono ou admin).
- Promoções automáticas acontecem sempre que `POST /games/{id}/decline` ou `DELETE /games/{id}/presences/{userId}` liberam vaga.

## Fluxos sugeridos para teste

1. Execute `docker-compose up --build` (ou inicialize backend/frontend manualmente).
2. Acesse `/register`, crie um usuário admin via `ADMIN_DEFAULT_USER` ou pela rota (ajuste no banco se necessário) e confirme a conta pelo link recebido.
3. Cadastre um usuário comum, confirme o e-mail e valide o fluxo “Esqueci a senha” (solicite, redefina e faça login com a nova senha).
4. Entre com qualquer usuário autenticado, acesse `/profile` e envie uma foto para testar o upload e a exibição do avatar.
5. Logado como admin, abra `/admin/users`, altere o status de um usuário e confirme que o valor aparece em todas as listas.
6. Ainda como admin, crie uma partida em “Criar partida”, selecione mensalistas, defina o prazo e teste a opção “Convocar automaticamente todos os mensalistas”.
7. Logado como superadmin, abra `/groups` para criar um novo grupo e utilize `/superadmin/invitations` para convidar um administrador associado a esse grupo.
8. Abra o link do convite de admin (`/register?token=...`), valide que o papel exibido é “Administrador” e conclua o cadastro; ao entrar, confira que o painel mostra apenas recursos do grupo vinculado.
9. Como admin, acesse “Convites” para enviar convites de usuários e confirme que todos são vinculados automaticamente ao seu grupo.
10. Abra o link recebido pelos usuários (`/register?token=...`), verifique que o grupo aparece fixo no formulário, conclua o cadastro do convidado e realize o login com a nova senha.
11. Ao cadastrar um usuário manualmente (sem convite), selecione um grupo e verifique que o vínculo é refletido nas APIs (`/auth/me`).
12. Entre com um usuário convocado e confirme/recuse presença para observar a liberação de vagas.
13. Entre com um usuário sem convocação e use o botão “Participar como avulso” (ou “Entrar na lista de espera”) quando não houver vaga.
14. Como admin, teste a atualização da lista de convocações e a remoção manual de presenças, observando a promoção automática da fila.

## Próximos passos

- Permitir convites por link específico e lembretes automáticos antes do prazo.
- Enviar notificações quando um usuário for promovido da fila de espera ou perder a vaga.
- Exibir histórico de partidas e estatísticas individuais.
