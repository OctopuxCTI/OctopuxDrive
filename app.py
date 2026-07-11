import os
import io
import json
import shutil
import zipfile
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, render_template, abort, Response
from werkzeug.utils import secure_filename

app = Flask(__name__)

BASE_DIR = os.path.join(os.getcwd(), 'arquivos')
META_DIR = os.path.join(os.getcwd(), 'arquivos', '.meta')
os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(META_DIR, exist_ok=True)

app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024 * 1024  # 5 GB


def get_client_ip():
    if request.headers.getlist("X-Forwarded-For"):
        return request.headers.getlist("X-Forwarded-For")[0].split(',')[0].strip()
    return request.remote_addr or 'desconhecido'


def caminho_seguro(subpath):
    subpath = subpath.lstrip('/')
    full = os.path.normpath(os.path.join(BASE_DIR, subpath))
    if not full.startswith(os.path.normpath(BASE_DIR)):
        abort(403)
    return full


def get_meta_path(item_path):
    """Gera caminho do arquivo de metadados para um item."""
    rel = os.path.relpath(item_path, BASE_DIR).replace('\\', '/')
    return os.path.join(META_DIR, rel + '.json')


def save_meta(item_path, ip, acao='upload'):
    """Salva metadados de um arquivo/pasta."""
    meta_file = get_meta_path(item_path)
    os.makedirs(os.path.dirname(meta_file), exist_ok=True)
    meta = {
        'nome': os.path.basename(item_path),
        'ip': ip,
        'data_criacao': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'acao': acao
    }
    if os.path.exists(meta_file):
        try:
            with open(meta_file, 'r', encoding='utf-8') as f:
                existing = json.load(f)
            meta['data_criacao'] = existing.get('data_criacao', meta['data_criacao'])
        except Exception:
            pass
    meta['data_modificacao'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    meta['ip_ultima_modificacao'] = ip
    with open(meta_file, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


def get_meta(item_path):
    """Lê metadados de um item."""
    meta_file = get_meta_path(item_path)
    if os.path.exists(meta_file):
        try:
            with open(meta_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return None


def delete_meta(item_path):
    """Remove metadados de um item e subitens."""
    meta_file = get_meta_path(item_path)
    if os.path.exists(meta_file):
        os.remove(meta_file)
    # Se for diretório, remove metadados dos filhos recursivamente
    if os.path.isdir(item_path):
        for root, dirs, files in os.walk(item_path):
            for name in dirs + files:
                child_path = os.path.join(root, name)
                child_meta = get_meta_path(child_path)
                if os.path.exists(child_meta):
                    os.remove(child_meta)


# ---------- PÁGINA PRINCIPAL ----------
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/<path:subpath>')
def catch_all(subpath):
    """Serve o index.html para qualquer caminho (navegação via History API)."""
    return render_template('index.html')


# ---------- APIs ----------
@app.route('/api/list')
def listar():
    subpath = request.args.get('path', '')
    tipo = request.args.get('tipo', '')
    full = caminho_seguro(subpath)
    if not os.path.isdir(full):
        return jsonify({'ok': False, 'erro': 'Caminho não é diretório'}), 400

    itens = []
    try:
        nomes = sorted(os.listdir(full))
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 500

    for nome in nomes:
        if nome.startswith('.'):
            continue
        item_path = os.path.join(full, nome)
        is_dir = os.path.isdir(item_path)
        if tipo == 'dir' and not is_dir:
            continue
        elif tipo == 'file' and is_dir:
            continue

        stat = os.stat(item_path)
        meta = get_meta(item_path)
        itens.append({
            'nome': nome,
            'tipo': 'dir' if is_dir else 'file',
            'tamanho': stat.st_size if not is_dir else 0,
            'modificado': datetime.fromtimestamp(stat.st_mtime).strftime('%d/%m/%Y %H:%M'),
            'ip_upload': meta.get('ip', meta.get('ip_ultima_modificacao', '')) if meta else '',
            'data_upload': meta.get('data_criacao', meta.get('data_modificacao', '')) if meta else '',
        })
    return jsonify({'ok': True, 'caminho': subpath, 'itens': itens})


@app.route('/api/upload', methods=['POST'])
def upload():
    subpath = request.form.get('path', '')
    destino_base = caminho_seguro(subpath)
    if not os.path.isdir(destino_base):
        return jsonify({'ok': False, 'erro': 'Destino inválido'}), 400

    if 'arquivos' not in request.files:
        return jsonify({'ok': False, 'erro': 'Nenhum arquivo'}), 400
    arquivos = request.files.getlist('arquivos')
    if not arquivos or all(f.filename == '' for f in arquivos):
        return jsonify({'ok': False, 'erro': 'Nenhum arquivo selecionado'}), 400

    ip = get_client_ip()
    salvos = []
    erros = []
    for f in arquivos:
        if f.filename == '':
            continue
        rel_path = f.filename.replace('\\', '/')
        partes = rel_path.split('/')
        partes = [secure_filename(p) for p in partes if p]
        if not partes:
            continue
        nome_arquivo = partes[-1]
        caminho_rel = '/'.join(partes[:-1])
        destino_dir = os.path.join(destino_base, caminho_rel) if caminho_rel else destino_base
        try:
            os.makedirs(destino_dir, exist_ok=True)
            full_path = os.path.join(destino_dir, nome_arquivo)
            f.save(full_path)
            save_meta(full_path, ip, 'upload')
            salvos.append(rel_path)
        except Exception as e:
            erros.append(f'{rel_path}: {str(e)}')

    if erros and not salvos:
        return jsonify({'ok': False, 'erro': '; '.join(erros)}), 500
    return jsonify({'ok': True, 'salvos': salvos, 'erros': erros if erros else None, 'ip': ip})


@app.route('/api/mkdir', methods=['POST'])
def mkdir():
    data = request.get_json()
    subpath = data.get('path', '')
    nome = data.get('nome', '').strip()
    if not nome:
        return jsonify({'ok': False, 'erro': 'Nome vazio'}), 400

    nome = secure_filename(nome)
    if not nome:
        return jsonify({'ok': False, 'erro': 'Nome inválido'}), 400

    destino = caminho_seguro(subpath)
    nova = os.path.join(destino, nome)
    try:
        os.makedirs(nova, exist_ok=False)
        ip = get_client_ip()
        save_meta(nova, ip, 'criar_pasta')
        return jsonify({'ok': True})
    except FileExistsError:
        return jsonify({'ok': False, 'erro': 'Já existe'}), 409
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 500


@app.route('/api/rename', methods=['POST'])
def rename():
    data = request.get_json()
    subpath = data.get('path', '')
    novo_nome = data.get('novo_nome', '').strip()
    if not novo_nome:
        return jsonify({'ok': False, 'erro': 'Nome vazio'}), 400

    novo_nome = secure_filename(novo_nome)
    if not novo_nome:
        return jsonify({'ok': False, 'erro': 'Nome inválido'}), 400

    alvo = caminho_seguro(subpath)
    if not os.path.exists(alvo):
        return jsonify({'ok': False, 'erro': 'Não encontrado'}), 404

    dirpath = os.path.dirname(alvo)
    destino = os.path.join(dirpath, novo_nome)
    if os.path.exists(destino):
        return jsonify({'ok': False, 'erro': 'Já existe um item com esse nome'}), 409

    try:
        shutil.move(alvo, destino)
        # Atualizar metadados
        delete_meta(alvo)
        ip = get_client_ip()
        save_meta(destino, ip, 'renomear')
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 500


@app.route('/api/delete', methods=['POST'])
def delete():
    data = request.get_json()
    subpath = data.get('path', '')
    alvo = caminho_seguro(subpath)
    if not os.path.exists(alvo):
        return jsonify({'ok': False, 'erro': 'Não encontrado'}), 404
    try:
        delete_meta(alvo)
        if os.path.isdir(alvo):
            shutil.rmtree(alvo)
        else:
            os.remove(alvo)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 500


@app.route('/api/move', methods=['POST'])
def move():
    """Move um arquivo/pasta para outro diretório."""
    data = request.get_json()
    src_path = data.get('src', '')
    dest_dir = data.get('dest', '')

    src = caminho_seguro(src_path)
    dest = caminho_seguro(dest_dir)

    if not os.path.exists(src):
        return jsonify({'ok': False, 'erro': 'Origem não encontrada'}), 404
    if not os.path.isdir(dest):
        return jsonify({'ok': False, 'erro': 'Destino não é diretório'}), 400

    filename = os.path.basename(src)
    final_dest = os.path.join(dest, filename)
    if os.path.exists(final_dest):
        return jsonify({'ok': False, 'erro': 'Já existe no destino'}), 409

    try:
        shutil.move(src, final_dest)
        delete_meta(src)
        ip = get_client_ip()
        save_meta(final_dest, ip, 'mover')
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 500


@app.route('/api/search')
def search():
    """Busca arquivos e pastas recursivamente."""
    query = request.args.get('q', '').strip().lower()
    if not query:
        return jsonify({'ok': True, 'resultados': []})

    resultados = []
    try:
        for root, dirs, files in os.walk(BASE_DIR):
            # Pular diretório de metadados
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for nome in dirs + files:
                if query in nome.lower():
                    full_path = os.path.join(root, nome)
                    rel_path = os.path.relpath(full_path, BASE_DIR).replace('\\', '/')
                    is_dir = os.path.isdir(full_path)
                    meta = get_meta(full_path)
                    resultados.append({
                        'nome': nome,
                        'caminho': rel_path,
                        'tipo': 'dir' if is_dir else 'file',
                        'tamanho': os.path.getsize(full_path) if not is_dir else 0,
                        'ip_upload': meta.get('ip', '') if meta else '',
                        'data_upload': meta.get('data_criacao', '') if meta else '',
                    })
            if len(resultados) >= 100:
                break
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 500

    return jsonify({'ok': True, 'resultados': resultados[:100]})


@app.route('/api/download')
def download():
    subpath = request.args.get('path', '')
    alvo = caminho_seguro(subpath)
    if os.path.isfile(alvo):
        dirpath, filename = os.path.split(alvo)
        return send_from_directory(dirpath, filename, as_attachment=True)
    elif os.path.isdir(alvo):
        return download_folder_zip(alvo, os.path.basename(alvo))
    abort(404)


def download_folder_zip(folder_path, folder_name):
    """Gera um ZIP em memória de uma pasta para download com Content-Length correto."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(folder_path):
            dirs[:] = [d for d in dirs if d != '.meta']
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, os.path.dirname(folder_path))
                zf.write(file_path, arcname)
    buf.seek(0)

    zip_name = secure_filename(folder_name) + '.zip'
    return Response(
        buf.getvalue(),
        mimetype='application/zip',
        headers={
            'Content-Disposition': f'attachment; filename="{zip_name}"',
            'Content-Length': str(len(buf.getvalue())),
        }
    )


@app.route('/api/storage')
def storage():
    """Retorna informações de armazenamento do disco."""
    try:
        usage = shutil.disk_usage(BASE_DIR)
        total = usage.total
        used = usage.used
        free = usage.free
        return jsonify({
            'ok': True,
            'total': total,
            'used': used,
            'free': free,
            'percent': round((used / total) * 100, 1) if total > 0 else 0
        })
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
