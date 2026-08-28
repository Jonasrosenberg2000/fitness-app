#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlencode, urlparse

ROOT = Path(__file__).resolve().parent


def load_env_file(path: Path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = [part.strip() for part in line.split('=', 1)]
        if key:
            os.environ[key] = value.strip('"\'')


load_env_file(ROOT / '.env')

DEFAULT_PORT = int(os.environ.get('PORT', '8000'))
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434/api/chat')
DEFAULT_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
OPENAI_BASE_URL = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
APP_BUILD = os.environ.get('RAILWAY_GIT_COMMIT_SHA') or os.environ.get('APP_BUILD') or 'local'
WITHINGS_CLIENT_ID = os.environ.get('WITHINGS_CLIENT_ID')
WITHINGS_CLIENT_SECRET = os.environ.get('WITHINGS_CLIENT_SECRET')
WITHINGS_AUTH_URL = os.environ.get('WITHINGS_AUTH_URL', 'https://account.withings.com/oauth2_user/authorize2')
WITHINGS_TOKEN_URL = os.environ.get('WITHINGS_TOKEN_URL', 'https://wbsapi.withings.net/v2/oauth2')
WITHINGS_WEIGHT_URL = os.environ.get('WITHINGS_WEIGHT_URL', 'https://wbsapi.withings.net/measure')
WITHINGS_MEASURE_URL = os.environ.get('WITHINGS_MEASURE_URL', 'https://wbsapi.withings.net/v2/measure')
OAUTH_STATE_SECRET = os.environ.get('OAUTH_STATE_SECRET') or WITHINGS_CLIENT_SECRET or 'change-this-oauth-state-secret'
WHOOP_CLIENT_ID = os.environ.get('WHOOP_CLIENT_ID')
WHOOP_CLIENT_SECRET = os.environ.get('WHOOP_CLIENT_SECRET')
WHOOP_AUTH_URL = os.environ.get('WHOOP_AUTH_URL', 'https://api-portal.whoop.com/oauth/oauth2/auth')
WHOOP_TOKEN_URL = os.environ.get('WHOOP_TOKEN_URL', 'https://api-portal.whoop.com/oauth/oauth2/token')
REDIRECT_URI = os.environ.get('REDIRECT_URI', 'https://web-production-2385a.up.railway.app/api/provider/callback')
RAILWAY_VOLUME_PATH = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH', '').strip()
TOKEN_STORE_PATH = Path(os.environ.get('TOKEN_STORE_PATH') or (Path(RAILWAY_VOLUME_PATH) / 'withings_tokens.json' if RAILWAY_VOLUME_PATH else ROOT / '.withings_tokens.json'))


def normalize_user_id(value: str | None) -> str:
    user_id = (value or '').strip()
    allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.'
    if not user_id or user_id == 'default' or len(user_id) > 120 or any(character not in allowed for character in user_id):
        raise ValueError('A unique user_id is required')
    return user_id


def create_oauth_state(provider: str, user_id: str) -> str:
    payload = json.dumps({'provider': provider, 'user_id': normalize_user_id(user_id), 'expires': int(time.time()) + 600}, separators=(',', ':')).encode('utf-8')
    encoded = base64.urlsafe_b64encode(payload).decode('ascii').rstrip('=')
    signature = hmac.new(OAUTH_STATE_SECRET.encode('utf-8'), encoded.encode('ascii'), hashlib.sha256).hexdigest()
    return f'{encoded}.{signature}'


def read_oauth_state(state: str, expected_provider: str) -> str:
    try:
        encoded, signature = state.rsplit('.', 1)
        expected_signature = hmac.new(OAUTH_STATE_SECRET.encode('utf-8'), encoded.encode('ascii'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            raise ValueError
        padded = encoded + '=' * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode('utf-8'))
        if payload.get('provider') != expected_provider or int(payload.get('expires', 0)) < int(time.time()):
            raise ValueError
        return normalize_user_id(payload.get('user_id'))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError('Invalid or expired OAuth state') from None


def local_fallback_answer(question: str) -> str:
    question_text = (question or '').strip()
    if not question_text:
        return 'Jeg er klar til at besvare spørgsmål. Skriv et spørgsmål, så jeg svarer lokalt.'
    return (
        f"Jeg er den lokale AI i All In One Fitness. Du spurgte: '{question_text}'. "
        "Jeg kan svare på generel viden, planlægning, træning, kost, sundhed og hverdagsspørgsmål. "
        "Ollama-modellen er ikke tilgængelig lige nu, så dette er et lokalt fallback-svar."
    )


def call_openai(question: str, context: dict | None = None, images: list[str] | None = None) -> str:
    if not OPENAI_API_KEY:
        raise RuntimeError('No OpenAI API key configured')

    user_content = question
    if images:
        user_content = [{'type': 'text', 'text': question}]
        for image in images[:3]:
            image_value = str(image or '').strip()
            if not image_value:
                continue
            if image_value.startswith('data:image/'):
                image_url = image_value
            else:
                mime_type = 'image/jpeg'
                if image_value.startswith('iVBOR'):
                    mime_type = 'image/png'
                elif image_value.startswith('UklGR'):
                    mime_type = 'image/webp'
                image_url = f'data:{mime_type};base64,{image_value}'
            user_content.append({'type': 'image_url', 'image_url': {'url': image_url, 'detail': 'high'}})

    messages = [
        {
            'role': 'system',
            'content': (
                'Du er en lokal, hjælpsom dansk AI-assistent for alle brugere af All In One Fitness. '
                'Svar på generelle spørgsmål, praktisk hjælp, viden, planlægning, træning, mad, vægt, søvn og restitution. '
                'Brug kun brugerens medsendte appdata, når spørgsmålet handler om dem. Opfind aldrig personlige tal. '
                'Ved kropsbilleder må du kun beskrive synlige muskelgrupper og træningsrelevante proportioner. '
                'Gæt aldrig identitet, køn, etnicitet, sygdom eller præcis fedtprocent, og giv ikke medicinske diagnoser. '
                'Svar kort, klart og brugbart på dansk.'
            )
        },
        {
            'role': 'user',
            'content': user_content
        }
    ]

    if context:
        messages.append({
            'role': 'system',
            'content': json.dumps(context, ensure_ascii=False)
        })

    payload = {
        'model': OPENAI_MODEL,
        'messages': messages,
        'temperature': 0.7
    }
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    request_obj = urllib.request.Request(
        f'{OPENAI_BASE_URL.rstrip("/")}/chat/completions',
        data=body,
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {OPENAI_API_KEY}'
        },
        method='POST'
    )

    with urllib.request.urlopen(request_obj, timeout=30) as response:
        data = json.loads(response.read().decode('utf-8'))
        answer = data.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
        if answer:
            return answer

    raise RuntimeError('OpenAI returned an empty response')


def call_ollama(question: str, context: dict | None = None, images: list[str] | None = None) -> str:
    if not question or not question.strip():
        return local_fallback_answer(question)

    payload = {
        'model': 'llava' if images else DEFAULT_MODEL,
        'stream': False,
        'messages': [
            {
                'role': 'system',
                'content': (
                    'Du er den lokale AI-assistent for alle brugere af All In One Fitness. '
                    'Svar på ethvert almindeligt spørgsmål samt spørgsmål om træning, kost, vægt, søvn, restitution og planlægning. '
                    'Brug kun de appdata, der følger med dette spørgsmål, og bland aldrig data mellem brugere. '
                    'Opfind aldrig personlige tal. Giv ikke medicinske diagnoser. Svar klart og brugbart på dansk.'
                )
            },
            {
                'role': 'user',
                'content': question
            }
        ]
    }

    if images:
        payload['messages'][-1]['images'] = images

    if context:
        payload['messages'].append({
            'role': 'system',
            'content': json.dumps(context, ensure_ascii=False)
        })

    body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    request_obj = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )

    with urllib.request.urlopen(request_obj, timeout=30) as response:
        data = json.loads(response.read().decode('utf-8'))
        answer = data.get('message', {}).get('content', '').strip()
        if answer:
            return answer

    raise RuntimeError('Ollama returned an empty response')


def generate_answer(question: str, context: dict | None = None, images: list[str] | None = None) -> tuple[str, str]:
    if OPENAI_API_KEY:
        try:
            return call_openai(question, context, images), 'openai'
        except Exception:
            pass

    try:
        return call_ollama(question, context, images), 'ollama'
    except Exception:
        return local_fallback_answer(question), 'fallback'


def read_token_store() -> dict:
    if not TOKEN_STORE_PATH.exists():
        return {}
    try:
        return json.loads(TOKEN_STORE_PATH.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def write_token_store(data: dict):
    TOKEN_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = TOKEN_STORE_PATH.with_suffix(f'{TOKEN_STORE_PATH.suffix}.tmp')
    temporary_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary_path.replace(TOKEN_STORE_PATH)


def normalize_withings_weight(value, unit=None) -> float:
    weight_value = float(value or 0)
    try:
        unit_value = int(unit)
    except (TypeError, ValueError):
        unit_value = 0
    weight_kg = weight_value * (10 ** unit_value)
    if unit_value == 0 and weight_kg > 300:
        weight_kg /= 100
    return round(weight_kg, 2)


def save_provider_token(provider: str, token_payload: dict, user_id: str):
    store = read_token_store()
    users = store.setdefault(f'{provider}_users', {})
    stored_token = {**users.get(user_id, {}), **token_payload}
    stored_token['_saved_at'] = int(time.time())
    try:
        expires_in = int(stored_token.get('expires_in', 0) or 0)
    except (TypeError, ValueError):
        expires_in = 0
    if expires_in > 0:
        stored_token['_expires_at'] = int(time.time()) + expires_in
    users[user_id] = stored_token
    write_token_store(store)


def delete_provider_token(provider: str, user_id: str):
    store = read_token_store()
    users = store.get(f'{provider}_users', {})
    users.pop(user_id, None)
    write_token_store(store)


def withings_error_message(payload: dict, fallback: str) -> str:
    status = payload.get('status') if isinstance(payload, dict) else None
    error = payload.get('error') if isinstance(payload, dict) else None
    if isinstance(error, dict):
        detail = error.get('message') or error.get('error')
    else:
        detail = error
    suffix = f' (status {status})' if status not in (None, 0) else ''
    return f'{detail or fallback}{suffix}'


def exchange_withings_code(code: str, user_id: str) -> dict:
    if not WITHINGS_CLIENT_ID or not WITHINGS_CLIENT_SECRET:
        raise RuntimeError('WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET must be configured')

    data = urlencode({
        'action': 'requesttoken',
        'grant_type': 'authorization_code',
        'client_id': WITHINGS_CLIENT_ID,
        'client_secret': WITHINGS_CLIENT_SECRET,
        'code': code,
        'redirect_uri': REDIRECT_URI,
    }).encode('utf-8')

    request = urllib.request.Request(
        WITHINGS_TOKEN_URL,
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        method='POST',
    )

    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode('utf-8'))

    body = payload.get('body') if isinstance(payload, dict) else None
    if payload.get('status') != 0 or not isinstance(body, dict) or not body.get('access_token'):
        raise RuntimeError(withings_error_message(payload, 'Withings did not return an access token'))

    save_provider_token('withings', body, user_id)
    return body


def refresh_withings_token(user_id: str) -> dict:
    if not WITHINGS_CLIENT_ID or not WITHINGS_CLIENT_SECRET:
        raise RuntimeError('WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET must be configured')

    token = read_token_store().get('withings_users', {}).get(user_id, {})
    refresh_token = token.get('refresh_token')
    if not refresh_token:
        raise RuntimeError('Withings connection must be authorized again')

    data = urlencode({
        'action': 'requesttoken',
        'grant_type': 'refresh_token',
        'client_id': WITHINGS_CLIENT_ID,
        'client_secret': WITHINGS_CLIENT_SECRET,
        'refresh_token': refresh_token,
    }).encode('utf-8')
    request = urllib.request.Request(
        WITHINGS_TOKEN_URL,
        data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode('utf-8'))

    body = payload.get('body') if isinstance(payload, dict) else None
    if payload.get('status') != 0 or not isinstance(body, dict) or not body.get('access_token'):
        raise RuntimeError(withings_error_message(payload, 'Withings token refresh failed'))
    save_provider_token('withings', body, user_id)
    return read_token_store().get('withings_users', {}).get(user_id, body)


def get_withings_access_token(user_id: str) -> str:
    store = read_token_store()
    token = store.get('withings_users', {}).get(user_id) or {}
    if token and token.get('_expires_at') and int(token['_expires_at']) <= int(time.time()) + 60:
        token = refresh_withings_token(user_id)
    access_token = token.get('access_token')
    if not access_token:
        raise RuntimeError('No saved Withings access token')
    return str(access_token)


def request_withings_data(url: str, params: dict, user_id: str, retry: bool = True) -> dict:
    access_token = get_withings_access_token(user_id)
    request = urllib.request.Request(
        url,
        data=urlencode(params).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        if retry and exc.code in (401, 403):
            refresh_withings_token(user_id)
            return request_withings_data(url, params, user_id, False)
        raise

    status = payload.get('status')
    if status not in (None, 0):
        if retry and status in (100, 101, 102, 200, 401):
            refresh_withings_token(user_id)
            return request_withings_data(url, params, user_id, False)
        raise RuntimeError(withings_error_message(payload, 'Withings data request failed'))
    return payload


def fetch_withings_latest_weight(user_id: str) -> dict:
    params = {
        'action': 'getmeas',
        'meastypes': '1',
        'limit': '100',
        'offset': '0'
    }
    payload = request_withings_data(WITHINGS_WEIGHT_URL, params, user_id)

    measure_groups = payload.get('body', {}).get('measuregrps', [])
    if not measure_groups:
        raise RuntimeError('No measurements returned from Withings')

    measurements = []
    for group in measure_groups:
        weight_measure = next((item for item in group.get('measures', []) if item.get('type') == 1), None)
        if not weight_measure:
            continue
        weight_value = normalize_withings_weight(weight_measure.get('value', 0), weight_measure.get('unit'))
        measurements.append({
            'weight_kg': weight_value,
            'date': group.get('date') or group.get('created') or ''
        })

    if not measurements:
        raise RuntimeError('No weight measurements in Withings payload')

    latest = measurements[0]
    weights = [item['weight_kg'] for item in measurements]
    return {
        'weight_kg': latest['weight_kg'],
        'date': latest['date'],
        'provider': 'withings',
        'measurements': measurements,
        'stats': {
            'count': len(weights),
            'average_kg': round(sum(weights) / len(weights), 2),
            'min_kg': min(weights),
            'max_kg': max(weights),
            'change_kg': round(latest['weight_kg'] - measurements[-1]['weight_kg'], 2)
        }
    }


def fetch_withings_today_activity(user_id: str) -> dict:
    today = __import__('datetime').date.today()
    start_date = today - __import__('datetime').timedelta(days=30)
    params = {
        'action': 'getactivity',
        'startdateymd': start_date.isoformat(),
        'enddateymd': today.isoformat(),
        'data_fields': 'steps,distance,calories,totalcalories'
    }
    payload = request_withings_data(WITHINGS_MEASURE_URL, params, user_id)

    if payload.get('status') not in (None, 0):
        error = payload.get('error', {})
        raise RuntimeError(error.get('message') if isinstance(error, dict) else str(error or 'Withings activity request failed'))

    activities = payload.get('body', {}).get('activities', [])
    if not activities:
        raise RuntimeError('No activity data returned from Withings')

    activity = next((item for item in activities if item.get('date') == today.isoformat()), activities[-1])
    return {
        'date': activity.get('date', today.isoformat()),
        'steps': int(activity.get('steps', 0) or 0),
        'distance_m': activity.get('distance', 0) or 0,
        'calories': activity.get('calories', 0) or 0,
        'active_calories': activity.get('calories', 0) or 0,
        'total_calories': activity.get('totalcalories', 0) or 0,
        'provider': 'withings'
    }


def build_provider_auth_url(provider: str, user_id: str) -> tuple[str, str]:
    provider_key = (provider or '').strip().lower()
    if provider_key == 'withings':
        if not WITHINGS_CLIENT_ID:
            raise RuntimeError('WITHINGS_CLIENT_ID is not configured')
        params = {
            'response_type': 'code',
            'client_id': WITHINGS_CLIENT_ID,
            'redirect_uri': REDIRECT_URI,
            'scope': 'user.info,user.metrics,user.activity',
            'state': create_oauth_state('withings', user_id)
        }
        query = urlencode(params)
        return f'{WITHINGS_AUTH_URL}?{query}', 'withings'

    if provider_key == 'whoop':
        if not WHOOP_CLIENT_ID:
            raise RuntimeError('WHOOP_CLIENT_ID is not configured')
        params = {
            'response_type': 'code',
            'client_id': WHOOP_CLIENT_ID,
            'redirect_uri': REDIRECT_URI,
            'scope': 'read:profile read:workout read:body_measurement read:recovery read:sleep',
            'state': 'whoop'
        }
        query = urlencode(params)
        return f'{WHOOP_AUTH_URL}?{query}', 'whoop'

    raise RuntimeError('Unsupported provider')


class LocalAIHandler(BaseHTTPRequestHandler):
    server_version = 'LocalAI/1.0'

    def log_message(self, format, *args):
        return

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/health':
            public_host = bool(os.environ.get('RAILWAY_ENVIRONMENT'))
            ai_provider = 'openai' if OPENAI_API_KEY else ('fallback' if public_host else 'ollama')
            self.send_json({
                'status': 'ok',
                'build': APP_BUILD,
                'model': OPENAI_MODEL if OPENAI_API_KEY else DEFAULT_MODEL,
                'provider': ai_provider,
                'ollama_url': OLLAMA_URL,
                'openai_base_url': OPENAI_BASE_URL,
                'publicly_hosted_ready': bool(OPENAI_API_KEY),
                'vision_ready': bool(OPENAI_API_KEY),
                'withings_configured': bool(WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET),
                'persistent_token_store': bool(RAILWAY_VOLUME_PATH or os.environ.get('TOKEN_STORE_PATH'))
            })
            return

        if parsed.path == '/api/provider/status':
            params = parse_qs(parsed.query)
            try:
                user_id = normalize_user_id(params.get('user_id', [''])[0])
            except ValueError as exc:
                self.send_json({'ok': False, 'message': str(exc)})
                return
            withings_token = read_token_store().get('withings_users', {}).get(user_id, {})
            self.send_json({
                'withings_configured': bool(WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET),
                'withings_connected': bool(withings_token.get('access_token')),
                'whoop_configured': bool(WHOOP_CLIENT_ID),
                'redirect_uri': REDIRECT_URI,
                'message': 'OAuth is ready when credentials are configured in environment variables.'
            })
            return

        if parsed.path.startswith('/api/provider/start'):
            params = parse_qs(parsed.query)
            provider = (params.get('provider', [''])[0] or '').strip().lower()
            try:
                user_id = normalize_user_id(params.get('user_id', [''])[0])
                url, provider_key = build_provider_auth_url(provider, user_id)
                self.send_json({'ok': True, 'provider': provider_key, 'url': url, 'message': f'{provider_key} auth URL generated'})
            except RuntimeError as exc:
                self.send_json({'ok': False, 'provider': provider, 'message': str(exc)})
            return

        if parsed.path.startswith('/api/provider/callback'):
            params = parse_qs(parsed.query)
            provider = (params.get('provider', ['withings'])[0] or 'withings').strip().lower()
            code = params.get('code', [''])[0]
            state = params.get('state', [''])[0]
            if not code:
                self.send_json({'ok': False, 'provider': provider, 'message': 'No OAuth code received'})
                return

            try:
                if provider == 'withings':
                    user_id = read_oauth_state(state, 'withings')
                    exchange_withings_code(code, user_id)
                    try:
                        latest = fetch_withings_latest_weight(user_id)
                        redirect_target = '/?' + urlencode({
                            'provider': 'withings',
                            'connected': '1',
                            'weight': str(latest.get('weight_kg', 0))
                        })
                    except Exception:
                        redirect_target = '/?provider=withings&connected=1&sync=empty'
                    self.send_response(302)
                    self.send_header('Location', redirect_target)
                    self.end_headers()
                    return

                self.send_json({'ok': False, 'provider': provider, 'message': 'Unsupported provider in callback.'})
            except Exception as exc:
                self.send_json({'ok': False, 'provider': provider, 'message': str(exc)})
            return

        if parsed.path.startswith('/api/provider/weight'):
            params = parse_qs(parsed.query)
            provider = (params.get('provider', ['withings'])[0] or 'withings').strip().lower()
            if provider == 'withings':
                try:
                    user_id = normalize_user_id(params.get('user_id', [''])[0])
                    result = fetch_withings_latest_weight(user_id)
                    self.send_json({'ok': True, 'provider': 'withings', **result})
                except Exception as exc:
                    self.send_json({'ok': False, 'provider': 'withings', 'message': str(exc)})
                return
            self.send_json({'ok': False, 'provider': provider, 'message': 'Unsupported provider'})
            return

        if parsed.path.startswith('/api/provider/activity'):
            params = parse_qs(parsed.query)
            provider = (params.get('provider', ['withings'])[0] or 'withings').strip().lower()
            if provider == 'withings':
                try:
                    user_id = normalize_user_id(params.get('user_id', [''])[0])
                    self.send_json({'ok': True, **fetch_withings_today_activity(user_id)})
                except Exception as exc:
                    self.send_json({'ok': False, 'provider': 'withings', 'message': str(exc)})
                return
            self.send_json({'ok': False, 'provider': provider, 'message': 'Unsupported provider'})
            return

        if parsed.path.startswith('/api/'):
            self.send_error(404, 'Not found')
            return

        file_path = self.resolve_static_path(parsed.path)
        if file_path is None:
            self.send_error(404, 'Not found')
            return

        try:
            data = file_path.read_bytes()
        except FileNotFoundError:
            self.send_error(404, 'Not found')
            return

        self.send_response(200)
        content_type = mimetypes.guess_type(str(file_path))[0] or 'application/octet-stream'
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/provider/disconnect':
            params = parse_qs(parsed.query)
            try:
                user_id = normalize_user_id(params.get('user_id', [''])[0])
                delete_provider_token('withings', user_id)
            except ValueError as exc:
                self.send_json({'ok': False, 'message': str(exc)})
                return
            self.send_json({'ok': True, 'provider': 'withings', 'disconnected': True})
            return
        if parsed.path != '/api/coach':
            self.send_error(404, 'Not found')
            return

        content_length = int(self.headers.get('Content-Length', '0'))
        raw_body = self.rfile.read(content_length) if content_length else b'{}'
        try:
            payload = json.loads(raw_body.decode('utf-8')) if raw_body else {}
        except json.JSONDecodeError:
            payload = {}

        question = str(payload.get('question', '')).strip()
        context = payload.get('context') or {}
        images = payload.get('images') if isinstance(payload.get('images'), list) else []
        answer, provider = generate_answer(question, context, images)
        self.send_json({'answer': answer, 'provider': provider})

    def resolve_static_path(self, requested_path: str):
        if requested_path in ('', '/'):
            requested_path = '/index.html'

        clean_path = unquote(requested_path).lstrip('/')
        if clean_path.startswith('api/'):
            return None

        candidate = (ROOT / clean_path).resolve()
        try:
            candidate.relative_to(ROOT.resolve())
        except ValueError:
            return None

        if candidate.is_dir():
            candidate = candidate / 'index.html'
        return candidate if candidate.exists() and candidate.is_file() else None

    def send_json(self, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    host = '0.0.0.0'
    server = ThreadingHTTPServer((host, DEFAULT_PORT), LocalAIHandler)
    print(f'Local AI app server running on http://{host}:{DEFAULT_PORT}')
    print(f'AI model target: {OLLAMA_URL}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping server...')
    finally:
        server.server_close()
