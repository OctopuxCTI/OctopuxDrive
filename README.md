# 🐙 OctopuxDrive

> Um servidor de armazenamento de arquivos robusto, minimalista e self-hosted, construído em Python (Flask) e JavaScript.

[![Licença](https://img.shields.io/badge/License-APACHE-blue.svg)](LICENSE)
[![Python Version](https://img.shields.io/badge/Python-3.8%2B-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Framework-Flask-green)](https://flask.palletsprojects.com/)

O **OctopuxDrive** é uma aplicação completa de gerenciamento e armazenamento de arquivos que funciona diretamente do seu navegador. Com uma interface moderna inspirada nas melhores soluções de nuvem, ele oferece alta performance, arrastar-e-soltar inteligente, suporte para diretórios complexos e gestão direta no sistema de arquivos local.

## ✨ Funcionalidades

- **Navegação Inteligente**:
  - History API: A URL muda conforme você navega sem recarregar a página (Single Page Application).
  - Visualização dinâmica em Grade (Grid) ou Lista (List).
  - Árvore lateral colapsável e redimensionável para fácil navegação.
- **Gerenciamento de Arquivos Avançado**:
  - Arrastar e Soltar global para arquivos e pastas do Sistema Operacional.
  - Movimentação interna (Arrastar um arquivo de uma pasta para a outra via interface).
  - Download dinâmico de pastas (Gera `.zip` on-the-fly mantendo a árvore de diretórios).
  - Criação, renomeação e exclusão nativa com detecção de duplicidade.
- **Upload Inteligente**:
  - Sistema assíncrono de upload com barra de progresso individual (`bytes/s`, `ETA`, `%`).
  - Suporte para upload de múltiplos arquivos simultaneamente.
  - Suporte a upload de diretórios recursivos.
- **Metadados e Segurança**:
  - Rastreio de IP de quem fez o upload e de quem modificou (`X-Forwarded-For` suportado).
  - Bloqueio de caminhos de travessia (Path Traversal) com a função `caminho_seguro`.
- **Interface e Experiência do Usuário (UI/UX)**:
  - Menu de contexto (Clique com o botão direito) personalizado.
  - Reconhecimento automático de ícones com base na extensão do arquivo.
  - Busca recursiva de arquivos com highlight da string.
  - Atalhos de teclado avançados (`Ctrl+U` para upload, `/` para buscar, etc).

## 📋 Pré-requisitos

Certifique-se de ter instalado em sua máquina:
- [Python 3.8+](https://www.python.org/downloads/)
- Gerenciador de pacotes `pip`

## 🔧 Instalação e Execução

Siga os passos abaixo para iniciar o seu próprio servidor na nuvem localmente:

1. **Clone o repositório:**
```bash
git clone [https://github.com/OctopuxCTI/OctopuxDrive.git](https://github.com/OctopuxCTI/OctopuxDrive.git)
cd OctopuxDrive
```

2. **Crie um ambiente virtual (Opcional, mas recomendado):**
```bash
python -m venv venv
source venv/bin/activate  # Linux / macOS
venv\Scripts\activate     # Windows
```


3. **Instale as dependências:**
```bash
pip install flask werkzeug
```


4. **Inicie o servidor:**
```bash
python app.py
```



O servidor começará a rodar em `http://0.0.0.0:5000/`. Acesse pelo navegador local através de `http://localhost:5000/`.

## 📁 Estrutura de Diretórios Gerada

Ao iniciar pela primeira vez, o script irá criar a seguinte árvore no diretório do projeto:

* `/arquivos/` - Diretório principal onde todos os arquivos serão salvos.
* `/arquivos/.meta/` - Diretório invisível na interface onde o sistema salva os metadados (Data de criação, IP de origem, ações) em arquivos `.json`.

## ⌨️ Atalhos de Teclado Suportados

Para agilizar o uso diário, o OctopuxDrive conta com as seguintes Hotkeys:

| Atalho | Ação |
| --- | --- |
| `Ctrl + U` | Abre a janela para Upload de Arquivo |
| `Ctrl + Shift + U` | Abre a janela para Upload de Pasta |
| `Ctrl + Shift + N` | Cria uma nova pasta no diretório atual |
| `/` | Foca na barra de busca |
| `Backspace` | Retorna para a pasta pai (Voltar) |
| `Alt + ←` / `Alt + →` | Navega pelo histórico (Avançar e Voltar raiz) |

## ⚙️ Limites de Arquivo (Configuração)

Por padrão, o servidor está configurado para suportar o upload de até **5 GB** de uma única vez.
Se você quiser alterar este limite, modifique a linha abaixo no `app.py`:

```python
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 * 1024  # 5 GB
```

## 🤝 Como Contribuir

1. Faça um Fork do projeto
2. Crie uma Branch para sua Feature (`git checkout -b feature/NovaFuncionalidade`)
3. Adicione suas mudanças (`git commit -m 'Adicionando uma Nova Funcionalidade'`)
4. Faça o Push para a Branch (`git push origin feature/NovaFuncionalidade`)
5. Abra um Pull Request



