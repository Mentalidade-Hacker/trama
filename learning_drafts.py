"""Local learning drafts, independent of the graph's revision and sync protocol."""
from datetime import datetime, timezone
import json
import re
import uuid

MAX_RECORDS = 2000
MAX_TOTAL = 16 * 1024 * 1024
MAX_RECORD = 128 * 1024


class DraftConflict(ValueError):
    def __init__(self, message, code="draft_conflict"):
        super().__init__(message)
        self.code = code


def setup_drafts(db):
    db.execute("CREATE TABLE IF NOT EXISTS learning_drafts (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, updated TEXT NOT NULL, data TEXT NOT NULL)")
    db.execute("CREATE TABLE IF NOT EXISTS learning_draft_meta (id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL)")
    db.execute("INSERT OR IGNORE INTO learning_draft_meta VALUES(1, ?)", (uuid.uuid4().hex,))


def text(value, limit=12000, required=False):
    if not isinstance(value, str) or len(value.encode('utf-16-le')) // 2 > limit or (required and not value.strip()):
        raise ValueError("Texto do rascunho inválido ou longo demais.")
    return value


def validate_data(value):
    if not isinstance(value, dict) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value.get('id', '') if isinstance(value.get('id'), str) else ''):
        raise ValueError("Identificador de rascunho inválido.")
    if value.get('tab') not in ('words', 'writing', 'review') or value.get('language') not in ('pt', 'en'):
        raise ValueError("Atividade do rascunho inválida.")
    source = value.get('lesson')
    if not isinstance(source, dict) or source.get('kind') not in ('word', 'writing', 'dictionary', 'correction') or source.get('language') != value['language']:
        raise ValueError("Lição do rascunho inválida.")
    lesson = {key: source[key] for key in ('kind', 'language')}
    lesson['id'] = text(source.get('id'), 600, True)
    for key in ('word', 'title', 'partOfSpeech', 'meaning', 'usage', 'before', 'after', 'explanation', 'prompt'):
        if key in source:
            lesson[key] = text(source[key])
    text(lesson.get('word') or lesson.get('title'), required=True)
    text(lesson.get('prompt'), required=True)
    for field, columns in (('examples', ('text', 'translation')), ('alternatives', ('word', 'note'))):
        rows = source.get(field, [])
        if not isinstance(rows, list) or len(rows) > 8 or any(not isinstance(row, dict) for row in rows):
            raise ValueError("Exemplos do rascunho inválidos.")
        lesson[field] = [{column: text(row.get(column, '')) for column in columns} for row in rows]
    if 'quiz' in source:
        quiz = source['quiz']
        if not isinstance(quiz, dict) or not isinstance(quiz.get('options'), list) or len(quiz['options']) != 4 or type(quiz.get('answer')) is not int or quiz['answer'] not in range(4):
            raise ValueError("Exercício do rascunho inválido.")
        lesson['quiz'] = {'sentence': text(quiz.get('sentence')), 'options': [text(item, 1000) for item in quiz['options']], 'answer': quiz['answer'], 'explanation': text(quiz.get('explanation'))}
    if 'source' in source:
        citation = source['source']
        if not isinstance(citation, dict):
            raise ValueError("Fonte do rascunho inválida.")
        lesson['source'] = {key: text(citation.get(key, ''), limit) for key, limit in (('name', 500), ('url', 4000), ('license', 100), ('licenseUrl', 4000))}
        for key in ('url', 'licenseUrl'):
            if lesson['source'][key] and not lesson['source'][key].startswith('https://'):
                raise ValueError("Endereço da fonte inválido.")
    key = ('review:' if value['tab'] == 'review' else '') + lesson['id']
    if value.get('key') != key:
        raise ValueError("A atividade não corresponde à lição do rascunho.")
    result = {name: value[name] for name in ('id', 'tab', 'language')}
    result.update(key=key, lesson=lesson, text=text(value.get('text'), 20000))
    if len(json.dumps(result, ensure_ascii=False).encode('utf-8')) > MAX_RECORD:
        raise ValueError("O rascunho excede 128 KB.")
    return result


class LearningDrafts:
    def __init__(self, store):
        self.store = store

    @staticmethod
    def export_records(db):
        return [{'id': row[0], 'revision': row[1], 'updated': row[2], 'data': json.loads(row[3])}
                for row in db.execute('SELECT id, revision, updated, data FROM learning_drafts ORDER BY updated, id')]

    @staticmethod
    def validate_backup(records):
        if not isinstance(records, list) or len(records) > MAX_RECORDS:
            raise ValueError("Quantidade de rascunhos inválida.")
        result, seen, size = [], set(), 0
        for row in records:
            if not isinstance(row, dict) or type(row.get('revision')) is not int or not 1 <= row['revision'] <= 9007199254740991:
                raise ValueError("Revisão do rascunho inválida.")
            data = validate_data(row.get('data'))
            if row.get('id') != data['id'] or data['id'] in seen:
                raise ValueError("Rascunho duplicado ou identificador inconsistente.")
            seen.add(data['id'])
            try:
                date = datetime.fromisoformat(text(row.get('updated'), 40).replace('Z', '+00:00'))
                if date.tzinfo is None:
                    raise ValueError()
            except (ValueError, TypeError):
                raise ValueError("Data do rascunho inválida.") from None
            item = {'id': data['id'], 'revision': row['revision'], 'updated': row['updated'], 'data': data}
            size += len(json.dumps(data, ensure_ascii=False).encode('utf-8'))
            if size > MAX_TOTAL:
                raise ValueError("Os rascunhos excedem 16 MB.")
            result.append(item)
        return result

    @staticmethod
    def replace_records(db, records):
        records = LearningDrafts.validate_backup(records)
        db.execute('DELETE FROM learning_drafts')
        db.executemany('INSERT INTO learning_drafts VALUES(?, ?, ?, ?)', [(r['id'], r['revision'], r['updated'], json.dumps(r['data'], ensure_ascii=False)) for r in records])
        db.execute('UPDATE learning_draft_meta SET epoch=? WHERE id=1', (uuid.uuid4().hex,))

    def read(self):
        with self.store.connect() as db:
            db.execute('BEGIN')
            return {'epoch': db.execute('SELECT epoch FROM learning_draft_meta WHERE id=1').fetchone()[0], 'records': self.export_records(db)}

    def save(self, payload):
        if not isinstance(payload, dict) or type(payload.get('revision')) is not int or not 0 <= payload['revision'] < 9007199254740991:
            raise ValueError("Pedido de rascunho inválido.")
        data = validate_data(payload.get('data'))
        serialized = json.dumps(data, ensure_ascii=False)
        with self.store.sync.lock, self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            epoch = db.execute('SELECT epoch FROM learning_draft_meta WHERE id=1').fetchone()[0]
            if payload.get('epoch') != epoch:
                raise DraftConflict("Os rascunhos foram restaurados ou você abriu outro banco. Reabra a aprendizagem antes de salvar.", 'draft_epoch')
            row = db.execute('SELECT revision, data FROM learning_drafts WHERE id=?', (data['id'],)).fetchone()
            # An acknowledgement can be lost after the commit. Identical retries are safe.
            if row and json.loads(row[1]) == data:
                return next(r for r in self.export_records(db) if r['id'] == data['id'])
            if (row[0] if row else 0) != payload['revision']:
                raise DraftConflict("Outra janela alterou este rascunho. Preserve as duas versões.")
            count, size = db.execute('SELECT COUNT(*), COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM learning_drafts WHERE id<>?', (data['id'],)).fetchone()
            if count >= MAX_RECORDS or size + len(serialized.encode('utf-8')) > MAX_TOTAL:
                raise ValueError("O armazenamento de rascunhos atingiu seu limite. Exporte um backup antes de continuar.")
            revision, updated = payload['revision'] + 1, datetime.now(timezone.utc).isoformat()
            db.execute('INSERT INTO learning_drafts VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, updated=excluded.updated, data=excluded.data', (data['id'], revision, updated, serialized))
            return {'id': data['id'], 'revision': revision, 'updated': updated, 'data': data}
