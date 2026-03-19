# Rede → Conta Azul Sync

Sistema web para importar relatórios de vendas da Rede (arquivo `.xlsx`) e lançar automaticamente as vendas de serviço no Conta Azul Pro via API.

## Funcionalidades

- Upload de arquivo Excel exportado do portal da Rede
- - Suporte a 4 estabelecimentos: **SIDE**, **ZONE**, **PLACE** e **STATION**
  - - Pré-visualização das vendas antes de importar
    - - Aplicação automática da taxa MDR por bandeira e modalidade
      - - Geração da descrição no padrão: `PRESTACAO DE SERVICO DE LAVANDERIA - Bandeira Modalidade`
        - - Autenticação OAuth2 com o Conta Azul (token renovado automaticamente)
          - - Controle de resultado por venda (sucesso/erro)
           
            - ## Taxas MDR configuradas
           
            - | Bandeira | Crédito à vista | Débito | Parcelado 2-4x | Parcelado 5-6x | Parcelado 7-12x |
            - |----------|----------------|--------|----------------|----------------|-----------------|
            - | Visa | 2,17% | 0,81% | 2,76% | 2,99% | 3,18% |
            - | Mastercard | 2,17% | 0,81% | 2,76% | 2,99% | 3,18% |
            - | Elo | 2,17% | 0,81% | 2,76% | 2,99% | 3,18% |
            - | Amex | 2,97% | - | 3,36% | 3,55% | 3,74% |
            - | Hipercard | 2,17% | 0,81% | - | - | - |
           
            - ## Estrutura do projeto
           
            - ```
              rede-contaazul-sync/
              ├── server.js              # Servidor Express principal
              ├── package.json
              ├── .env.example           # Variáveis de ambiente (copiar para .env)
              ├── public/
              │   └── index.html         # Interface web (upload + preview + resultados)
              └── routes/
                  ├── auth.js            # OAuth2 com Conta Azul
                  └── upload.js          # Parser Excel + integração API
              ```

              ## Pré-requisitos

              - Node.js 18+
              - - Conta no [Portal do Desenvolvedor da Conta Azul](https://developers-portal.contaazul.com)
                - - Aplicativo cadastrado no portal (para obter `client_id` e `client_secret`)
                 
                  - ## Instalação
                 
                  - ```bash
                    git clone https://github.com/jaffoliveira/rede-contaazul-sync.git
                    cd rede-contaazul-sync
                    npm install
                    cp .env.example .env
                    ```

                    ## Configuração

                    ### 1. Criar aplicativo no Conta Azul

                    Acesse o [Portal do Desenvolvedor](https://developers-portal.contaazul.com) e crie um aplicativo para cada login:
                    - Um app para **PLACE** e **STATION** (mesmo login)
                    - - Um app para **SIDE** e **ZONE** (mesmo login)
                     
                      - Configure a **Redirect URI** como: `http://localhost:3000/api/auth/callback` (ou o domínio em produção)
                     
                      - ### 2. Configurar variáveis de ambiente
                     
                      - Edite o arquivo `.env` com as credenciais obtidas:
                     
                      - ```env
                        PORT=3000
                        REDIRECT_URI=http://localhost:3000/api/auth/callback

                        CA_PLACE_CLIENT_ID=...
                        CA_PLACE_CLIENT_SECRET=...
                        # (ver .env.example para lista completa)
                        ```

                        ### 3. Obter IDs de configuração via API

                        Após autenticar, use os endpoints da Conta Azul para obter os UUIDs:

                        ```bash
                        # Centro de custo
                        GET https://api-v2.contaazul.com/v1/centro-custo

                        # Conta de recebimento
                        GET https://api-v2.contaazul.com/v1/conta

                        # Categoria financeira
                        GET https://api-v2.contaazul.com/v1/categoria
                        ```

                        Adicione os IDs correspondentes ao `.env`.

                        ## Uso

                        ```bash
                        npm start
                        # Acesse http://localhost:3000
                        ```

                        1. **Autentique** cada loja clicando em "Login" — você será redirecionado para o Conta Azul
                        2. 2. **Selecione** a loja (SIDE, ZONE, PLACE ou STATION)
                           3. 3. **Faça upload** do arquivo `.xlsx` exportado do portal da Rede
                              4. 4. Clique em **Visualizar** para conferir as vendas antes de importar
                                 5. 5. Clique em **Importar para Conta Azul** — o resultado aparece com status por venda
                                   
                                    6. ## Formato do Excel da Rede
                                   
                                    7. O sistema reconhece automaticamente as colunas do export padrão da Rede. Colunas esperadas (nomes flexíveis):
                                   
                                    8. | Campo | Colunas aceitas |
                                    9. |-------|----------------|
                                    10. | Data | `Data`, `Data Transacao`, `Data da Transacao` |
                                    11. | Status | `Status`, `Situacao` |
                                    12. | Valor | `Valor`, `Valor Bruto`, `Valor da Transacao` |
                                    13. | Bandeira | `Bandeira`, `Cartao` |
                                    14. | Modalidade | `Modalidade`, `Tipo`, `Produto` |
                                    15. | Canal | `Canal`, `Origem` |
                                    16. | Parcelas | `Parcelas`, `Numero de Parcelas` |
                                   
                                    17. Vendas com status **negada**, **cancelada** ou **revertida** são ignoradas automaticamente.
                                   
                                    18. ## Desenvolvimento
                                   
                                    19. ```bash
                                        npm run dev  # nodemon com hot-reload
                                        ```

                                        ## Licença

                                        MIT
