#!/usr/bin/env python3
"""Converte o banco compilado para JSONs estáticos, mantendo IDs e imagens."""
import argparse, collections, hashlib, json, re, shutil
from pathlib import Path

SPECIALTIES = {
    'Neurologia': ('neuro', 'Neuroclínica e neurocirurgia', 'M3'),
    'Endocrinologia': ('endocrino', 'Endocrinologia', 'M4'),
    'Otorrinolaringologia': ('otorrino', 'Otorrino e cabeça e pescoço', 'M4'),
    'Oftalmologia': ('oftalmo', 'Oftalmologia', 'M3'),
}

def convert(bank_path, source_root, site_root):
    bank = json.loads(bank_path.read_text())
    inventory = json.loads((source_root/'work/inventory.json').read_text())
    names = {x['id']: x['name'] for x in inventory}
    assets = site_root/'assets/questions'; assets.mkdir(parents=True, exist_ok=True)
    data = site_root/'data'; data.mkdir(exist_ok=True)
    copied = {}
    def image(s):
        p = Path(s)
        relative = str(p).split('/work/', 1)[-1] if '/work/' in str(p) else str(p).removeprefix('work/')
        local = source_root/'work'/relative
        if not local.exists(): local = p if p.is_absolute() else source_root/p
        if not local.is_file(): raise FileNotFoundError(s)
        digest = hashlib.sha256(local.read_bytes()).hexdigest()
        target = assets/(digest[:24]+local.suffix.lower())
        if digest not in copied: shutil.copyfile(local, target); copied[digest] = target
        return 'assets/questions/'+target.name
    groups = collections.defaultdict(list)
    for old in bank['questions']:
        specialty, label, rotation = SPECIALTIES[old['specialty']]
        text = old['text'].strip()
        parts = re.split(r'(?m)^\s*([a-e])\)\s*', text, flags=re.I)
        stem, options = parts[0], []
        if old['kind'] == 'objective':
            options = [{'label': parts[i].upper(), 'text': ' '.join(parts[i+1].split())} for i in range(1, len(parts), 2)]
        else: stem = text
        answer = old.get('answer') or None
        fmt = 'written' if old['kind'] == 'discursive' else 'single'
        if old['kind'] == 'objective' and answer and re.fullmatch(r'[VFvf,\s]+', answer):
            fmt = 'true-false'
            if not options:
                pieces = re.split(r'\(\s*\)\s*(\d+)[.)]\s*', text)
                stem = pieces[0].strip()
                options = [{'label': pieces[i], 'text': pieces[i+1].strip()} for i in range(1, len(pieces), 2)]
        uncertain = old.get('key_conflict', '')
        if fmt == 'single' and answer and not re.fullmatch(r'[A-Ea-e]', answer.strip()):
            uncertain = uncertain or 'A fonte marca mais de uma alternativa para um enunciado de resposta única. Aguarda revisão do administrador.'
        origins = [dict(x, file=names.get(x['source'], x['source'])) for x in old.get('origins', [])]
        q = {
            'uid': old['uid'], 'id': old['new_id'], 'specialty': specialty,
            'kind': old['kind'], 'format': fmt, 'topic': old['topic'],
            'chapter': old.get('oral_chapter') or bank.get('oral_chapters', {}).get(old.get('chapter_code'), '') or (f'{label} — prova oral' if old.get('oral') else ''), 'oral': bool(old.get('oral')),
            'stem': stem.strip(), 'context': old.get('context', ''), 'options': options,
            'images': [image(x) for x in old.get('images', [])],
            'answer': answer.strip().upper() if answer and old['kind'] == 'objective' else answer,
            'comment': old.get('answer_text', ''), 'answerOrigin': old.get('answer_origin', ''),
            'answerImages': [image(x) for x in old.get('answer_images', [])],
            'related': old.get('answer_related_uids', []),
            'reviewNote': old.get('review_note', ''), 'reviewCodes': old.get('review_codes', []),
            'keyConflict': uncertain, 'reconstructed': bool(old.get('reconstructed')),
            'origins': origins, 'enabled': True,
        }
        groups[specialty].append(q)
    def write(name, value):
        (data/name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
    total = sum(map(len, groups.values()))
    specialties = []
    for raw, (slug, label, rotation) in SPECIALTIES.items():
        qs = groups[slug]
        write(slug+'.json', qs)
        specialties.append({'id': slug, 'label': label, 'rotation': rotation, 'count': len(qs), 'file': slug+'.json'})
    write('manifest.json', {'schemaVersion': 1, 'title': 'PrepMed Insano', 'total': total,
          'objective': sum(q['kind']=='objective' for qs in groups.values() for q in qs),
          'discursive': sum(q['kind']=='discursive' for qs in groups.values() for q in qs),
          'imageCount': len(copied),
          'revision': '2026-10-03-provao', 'specialties': specialties,
          'reviewNotes': bank.get('oral_review_notes', {}),
          'sources': [{'id': x['id'], 'name': x['name']} for x in inventory]})
    write('gabaritos-originais.json', {'keysets': bank.get('keysets', []), 'keytextsets': bank.get('keytextsets', []), 'references': bank.get('references', {})})
    editions = data/'edicoes.json'
    if not editions.exists(): write('edicoes.json', {'schemaVersion': 1, 'updatedAt': None, 'questions': {}})
    print(json.dumps({'questions': total, 'images': len(copied), 'bySpecialty': {k: len(v) for k,v in groups.items()}}, ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bank', type=Path)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--site-root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    convert(args.bank, args.source_root, args.site_root)
