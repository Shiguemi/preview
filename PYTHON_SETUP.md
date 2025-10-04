# Python Backend - Instalação Automática

Este projeto agora usa um backend Python para conversão de arquivos EXR, com instalação automática do ambiente virtual Python.

## Como Funciona

### Primeira Execução

1. **Detecção do Python do Sistema**: O aplicativo busca Python 3.x já instalado no sistema (python3 ou python)

2. **Criação de Ambiente Virtual**: Se o Python for encontrado, um ambiente virtual (venv) é criado em `%APPDATA%/ImagePreview/python-env` (Windows) ou equivalente em outras plataformas

3. **Instalação de Dependências**: As seguintes bibliotecas Python serão instaladas automaticamente no venv:
   - Flask >= 3.0.0 (servidor web)
   - Pillow >= 10.0.0 (processamento de imagem)
   - opencv-python >= 4.8.0 (suporte para arquivos EXR)
   - NumPy >= 1.24.0 (manipulação de arrays)

4. **Inicialização do Backend**: O servidor Python será iniciado automaticamente em segundo plano na porta 5000

### Armazenamento

- O ambiente virtual Python será criado em: `%APPDATA%/ImagePreview/python-env` (Windows) ou equivalente em outras plataformas
- A instalação é persistente - só precisa ser feita uma vez
- Logs de debug são salvos em: `%APPDATA%/ImagePreview/debug.log`

### Requisitos

- **Python 3.x**: Deve estar instalado no sistema (python3 ou python no PATH)
- **Conexão com Internet**: Necessária apenas na primeira execução para download das dependências
- **Espaço em Disco**: ~300-500MB para ambiente virtual e bibliotecas
- **Tempo de Instalação**: 2-5 minutos na primeira execução (dependendo da velocidade da internet)

## Desenvolvimento

### Testando Localmente

```bash
# Instalar dependências do Node
npm install

# Executar em modo desenvolvimento
npm start
```

Na primeira execução em desenvolvimento, o Python será instalado automaticamente.

### Backend Python Manual (Opcional)

Se você quiser testar o backend Python separadamente:

```bash
cd resources/backend

# Criar ambiente virtual
python -m venv venv

# Ativar ambiente (Windows)
venv\Scripts\activate

# Ativar ambiente (Linux/Mac)
source venv/bin/activate

# Instalar dependências
pip install -r requirements.txt

# Executar servidor
python server.py 5000
```

### Endpoints da API

- `GET /health` - Verifica se o servidor está funcionando
- `POST /convert` - Converte arquivo EXR para JPEG

Exemplo de requisição:
```json
{
  "file_data": "base64_encoded_file_content",
  "max_size": 800,
  "gamma": 2.2
}
```

**Nota**: O arquivo é lido pelo Node.js e enviado como base64 para o backend Python. Isso resolve problemas de compatibilidade de caminhos (como drives de rede Windows e paths WSL).

## Build e Distribuição

### Gerar Instalador

```bash
npm run make
```

O instalador incluirá:
- Aplicativo Electron
- Scripts do backend Python (em `resources/backend`)
- **NÃO** inclui o ambiente virtual Python (criado na primeira execução)

### Vantagens desta Abordagem

1. **Instalador Menor**: ~50MB ao invés de ~150MB
2. **Usa Python do Sistema**: Aproveita Python já instalado
3. **Ambiente Isolado**: Venv garante dependências isoladas sem conflitos
4. **Multiplataforma**: Funciona em Windows, Mac e Linux
5. **Compatibilidade de Paths**: Leitura de arquivos no Node.js resolve problemas com drives de rede e WSL

### Desvantagens

1. **Requer Python Instalado**: Usuário deve ter Python 3.x no sistema
2. **Requer Internet na Primeira Execução**: Para download das dependências
3. **Tempo de Inicialização**: Primeira execução demora 2-5 minutos

## Solução de Problemas

### Python não encontrado no sistema

1. Instale Python 3.x no sistema e certifique-se de que está no PATH
2. Verifique se o comando `python` ou `python3` funciona no terminal
3. Reinicie a aplicação após instalar o Python

### Ambiente virtual não está sendo criado

1. Verifique a conexão com internet
2. Verifique os logs em `%APPDATA%/ImagePreview/debug.log`
3. Tente excluir a pasta `%APPDATA%/ImagePreview/python-env` e reiniciar

### Erro ao converter EXR

1. Verifique se o backend está rodando: acesse `http://127.0.0.1:5000/health`
2. Verifique os logs do Python no console do Electron
3. Certifique-se de que o arquivo EXR não está corrompido

### Backend não inicia

1. Verifique se a porta 5000 não está em uso
2. Verifique se as dependências Python foram instaladas corretamente
3. Tente reinstalar executando: `python -m pip install -r resources/backend/requirements.txt` manualmente

## Estrutura de Arquivos

```
preview/
├── main.js                    # Processo principal do Electron
├── python-manager.js          # Gerenciador do ambiente Python
├── resources/
│   └── backend/
│       ├── server.py         # Servidor Flask
│       └── requirements.txt  # Dependências Python
└── forge.config.js           # Configuração do Electron Forge
```

## Notas de Implementação

### Segurança

- Backend roda apenas em `localhost` (127.0.0.1)
- Não aceita conexões externas
- Validação de paths de arquivo para evitar directory traversal

### Performance

- Cache de imagens convertidas no JavaScript
- Conversão assíncrona para não bloquear a UI
- Timeout de 60 segundos para conversões
- Limite de 100MB para tamanho de arquivo EXR

### Detalhes Técnicos

- **OpenCV**: Usado para leitura de arquivos EXR (cv2.imdecode)
- **Gamma Correction**: Aplicado com gamma padrão de 2.2
- **Conversão RGBA→RGB**: Imagens com canal alpha são compostas em fundo branco
- **Transferência de Dados**: Arquivos são lidos em Node.js e enviados como base64 para Python
- **Variável de Ambiente**: `OPENCV_IO_ENABLE_OPENEXR=1` habilitada automaticamente no servidor Python

### Compatibilidade

- **Windows**: Usa Python do sistema + venv
- **macOS**: Usa Python do sistema + venv
- **Linux**: Usa Python do sistema + venv
- **WSL**: Compatível (arquivos lidos em Node.js antes de enviar ao Python)
