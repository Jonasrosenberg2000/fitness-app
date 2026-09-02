#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import threading
import time
import urllib.error
import urllib.request
from http.cookies import CookieError, SimpleCookie
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


load_env_file(ROOT / os.environ.get('ENV_FILE', '.env'))

DEFAULT_PORT = int(os.environ.get('PORT', '8000'))
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434/api/chat')
DEFAULT_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY')
OPENAI_BASE_URL = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
OPENAI_MAX_OUTPUT_TOKENS = int(os.environ.get('OPENAI_MAX_OUTPUT_TOKENS', '900'))
STRIPE_SECRET_KEY = os.environ.get('STRIPE_SECRET_KEY')
STRIPE_PRICE_ID = os.environ.get('STRIPE_PRICE_ID')
STRIPE_WEEKLY_PRICE_ID = os.environ.get('STRIPE_WEEKLY_PRICE_ID')
STRIPE_ANNUAL_PRICE_ID = os.environ.get('STRIPE_ANNUAL_PRICE_ID')
STRIPE_ANNUAL_DISCOUNT_COUPON_ID = os.environ.get('STRIPE_ANNUAL_DISCOUNT_COUPON_ID')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET')
STRIPE_PORTAL_CONFIGURATION_ID = os.environ.get('STRIPE_PORTAL_CONFIGURATION_ID')
SUPABASE_URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
SUPABASE_PUBLISHABLE_KEY = os.environ.get('SUPABASE_PUBLISHABLE_KEY', '')
DEFAULT_PUBLIC_APP_URL = 'https://web-production-2385a.up.railway.app'
PUBLIC_APP_URL = os.environ.get('PUBLIC_APP_URL', DEFAULT_PUBLIC_APP_URL).rstrip('/')
BILLING_ENVIRONMENT = os.environ.get('BILLING_ENVIRONMENT', 'live').strip().lower()
APP_OPEN_ACCESS = os.environ.get('APP_OPEN_ACCESS', '1').strip() == '1'
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
PRO_MONTHLY_PRICE_DKK = 39
PRO_WEEKLY_PRICE_DKK = 20
PRO_ANNUAL_PRICE_DKK = PRO_MONTHLY_PRICE_DKK * 12
PRO_ANNUAL_DISCOUNT_PERCENT = 40
PRO_ANNUAL_INTRO_PRICE_DKK = PRO_ANNUAL_PRICE_DKK * (100 - PRO_ANNUAL_DISCOUNT_PERCENT) / 100
PRO_COACH_MONTHLY_LIMIT = int(os.environ.get('PRO_COACH_MONTHLY_LIMIT', '60'))
PRO_VISION_MONTHLY_LIMIT = int(os.environ.get('PRO_VISION_MONTHLY_LIMIT', '4'))
MAX_COACH_REQUEST_BYTES = int(os.environ.get('MAX_COACH_REQUEST_BYTES', str(12 * 1024 * 1024)))
OWNER_USER_ID = os.environ.get('OWNER_USER_ID', '').strip()
LOCAL_DEV_AUTH = os.environ.get('LOCAL_DEV_AUTH', '').strip() == '1'
LOCAL_DEV_USER_EMAIL = os.environ.get('LOCAL_DEV_USER_EMAIL', 'local-pro@allinonefitness.test').strip()
BILLING_STORE_PATH = Path(os.environ.get('BILLING_STORE_PATH') or (Path(RAILWAY_VOLUME_PATH) / 'billing.json' if RAILWAY_VOLUME_PATH else ROOT / '.billing.json'))
BILLING_STORE_LOCK = threading.Lock()
AUTH_ACCESS_COOKIE = 'aio_access_token'
AUTH_REFRESH_COOKIE = 'aio_refresh_token'
RATE_LIMIT_WINDOW_SECONDS = max(1, int(os.environ.get('RATE_LIMIT_WINDOW_SECONDS', '60')))
AUTH_BURST_LIMIT = max(1, int(os.environ.get('AUTH_BURST_LIMIT', '10')))
BILLING_BURST_LIMIT = max(1, int(os.environ.get('BILLING_BURST_LIMIT', '20')))
COACH_BURST_LIMIT = max(1, int(os.environ.get('COACH_BURST_LIMIT', '10')))
RATE_LIMIT_MAX_BUCKETS = max(128, int(os.environ.get('RATE_LIMIT_MAX_BUCKETS', '4096')))
RATE_LIMIT_LOCK = threading.Lock()
RATE_LIMIT_BUCKETS = {}


def validate_billing_environment():
    if BILLING_ENVIRONMENT not in ('live', 'test'):
        raise RuntimeError('BILLING_ENVIRONMENT skal være live eller test.')
    if BILLING_ENVIRONMENT == 'test':
        if not STRIPE_SECRET_KEY or not STRIPE_SECRET_KEY.startswith(('sk_test_', 'rk_test_')):
            raise RuntimeError('Testmiljøet kræver en Stripe testnøgle.')
        if PUBLIC_APP_URL == DEFAULT_PUBLIC_APP_URL:
            raise RuntimeError('Testmiljøet må ikke bruge produktionens PUBLIC_APP_URL.')
    elif STRIPE_SECRET_KEY and STRIPE_SECRET_KEY.startswith(('sk_test_', 'rk_test_')):
        raise RuntimeError('Stripe testnøgler kræver BILLING_ENVIRONMENT=test.')


def rate_limit_exceeded(scope: str, client_id: str, limit: int) -> bool:
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    key = (scope, client_id)
    with RATE_LIMIT_LOCK:
        if key not in RATE_LIMIT_BUCKETS and len(RATE_LIMIT_BUCKETS) >= RATE_LIMIT_MAX_BUCKETS:
            stale_keys = [bucket_key for bucket_key, timestamps in RATE_LIMIT_BUCKETS.items() if not timestamps or timestamps[-1] <= cutoff]
            for stale_key in stale_keys:
                RATE_LIMIT_BUCKETS.pop(stale_key, None)
            if len(RATE_LIMIT_BUCKETS) >= RATE_LIMIT_MAX_BUCKETS:
                oldest_key = min(RATE_LIMIT_BUCKETS, key=lambda bucket_key: RATE_LIMIT_BUCKETS[bucket_key][-1])
                RATE_LIMIT_BUCKETS.pop(oldest_key, None)
        requests = [timestamp for timestamp in RATE_LIMIT_BUCKETS.get(key, []) if timestamp > cutoff]
        if len(requests) >= limit:
            RATE_LIMIT_BUCKETS[key] = requests
            return True
        requests.append(now)
        RATE_LIMIT_BUCKETS[key] = requests
        return False


class SupabaseAuthError(RuntimeError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def supabase_auth_request(path: str, method: str = 'GET', payload: dict | None = None, access_token: str = '') -> dict:
    if not SUPABASE_URL or not SUPABASE_PUBLISHABLE_KEY:
        raise RuntimeError('Supabase login er ikke konfigureret endnu.')
    body = json.dumps(payload).encode('utf-8') if payload is not None else None
    headers = {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json'
    }
    if access_token:
        headers['Authorization'] = f'Bearer {access_token}'
    request_obj = urllib.request.Request(
        f'{SUPABASE_URL}{path}',
        data=body,
        headers=headers,
        method=method
    )
    try:
        with urllib.request.urlopen(request_obj, timeout=15) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        try:
            error_payload = json.loads(exc.read().decode('utf-8'))
            message = str(error_payload.get('msg') or error_payload.get('message') or error_payload.get('error_description') or '')
        except (ValueError, UnicodeDecodeError):
            message = ''
        raise SupabaseAuthError(message or 'Supabase kunne ikke gennemføre login.', exc.code) from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError('Supabase kunne ikke kontaktes. Prøv igen.') from None


def normalize_user_id(value: str | None) -> str:
    user_id = (value or '').strip()
    allowed = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.'
    if not user_id or user_id == 'default' or len(user_id) > 120 or any(character not in allowed for character in user_id):
        raise ValueError('A unique user_id is required')
    return user_id


def read_billing_store() -> dict:
    if not BILLING_STORE_PATH.exists():
        return {'users': {}}
    try:
        payload = json.loads(BILLING_STORE_PATH.read_text(encoding='utf-8'))
        return payload if isinstance(payload, dict) else {'users': {}}
    except (OSError, ValueError):
        return {'users': {}}


def write_billing_store(store: dict):
    BILLING_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = BILLING_STORE_PATH.with_suffix(f'{BILLING_STORE_PATH.suffix}.tmp')
    temporary_path.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary_path.replace(BILLING_STORE_PATH)


def billing_period_key() -> str:
    return time.strftime('%Y-%m', time.gmtime())


def billing_plan_configuration() -> dict:
    return {
        'weekly': bool(STRIPE_SECRET_KEY and STRIPE_WEEKLY_PRICE_ID and STRIPE_WEBHOOK_SECRET),
        'monthly': bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET),
        'annual': bool(STRIPE_SECRET_KEY and STRIPE_ANNUAL_PRICE_ID and STRIPE_ANNUAL_DISCOUNT_COUPON_ID and STRIPE_WEBHOOK_SECRET)
    }


def is_owner_user(user_id: str) -> bool:
    normalized_user_id = normalize_user_id(user_id)
    return bool(OWNER_USER_ID) and hmac.compare_digest(normalized_user_id, OWNER_USER_ID)


def get_billing_status(user_id: str) -> dict:
    normalized_user_id = normalize_user_id(user_id)
    user = read_billing_store().get('users', {}).get(normalized_user_id, {})
    is_owner = is_owner_user(normalized_user_id)
    is_pro = is_owner or user.get('status') in ('active', 'trialing')
    plan_configuration = billing_plan_configuration()
    monthly_configured = plan_configuration['monthly']
    weekly_configured = plan_configuration['weekly']
    annual_configured = plan_configuration['annual']
    usage = user.get('usage', {}).get(billing_period_key(), {}) if is_pro else {}
    coach_used = max(0, int(usage.get('coach', 0) or 0))
    vision_used = max(0, int(usage.get('vision', 0) or 0))
    return {
        'configured': any(plan_configuration.values()),
        'billing_environment': BILLING_ENVIRONMENT,
        'test_mode': BILLING_ENVIRONMENT == 'test',
        'plan': 'pro' if is_pro else 'free',
        'is_pro': is_pro,
        'is_owner': is_owner,
        'billing_plan': str(user.get('billing_plan') or ''),
        'price_dkk': PRO_MONTHLY_PRICE_DKK,
        'plans': {
            'weekly': {'configured': weekly_configured, 'price_dkk': PRO_WEEKLY_PRICE_DKK},
            'monthly': {'configured': monthly_configured, 'price_dkk': PRO_MONTHLY_PRICE_DKK},
            'annual': {
                'configured': annual_configured,
                'price_dkk': PRO_ANNUAL_PRICE_DKK,
                'intro_price_dkk': PRO_ANNUAL_INTRO_PRICE_DKK,
                'intro_discount_percent': PRO_ANNUAL_DISCOUNT_PERCENT
            }
        },
        'period': billing_period_key(),
        'limits': {'coach': PRO_COACH_MONTHLY_LIMIT, 'vision': PRO_VISION_MONTHLY_LIMIT},
        'usage': {'coach': coach_used, 'vision': vision_used},
        'remaining': {
            'coach': max(0, PRO_COACH_MONTHLY_LIMIT - coach_used),
            'vision': max(0, PRO_VISION_MONTHLY_LIMIT - vision_used)
        }
    }


def record_ai_usage(user_id: str, usage_type: str):
    if usage_type not in ('coach', 'vision'):
        return
    with BILLING_STORE_LOCK:
        store = read_billing_store()
        users = store.setdefault('users', {})
        user = users.setdefault(normalize_user_id(user_id), {})
        period_usage = user.setdefault('usage', {}).setdefault(billing_period_key(), {})
        period_usage[usage_type] = max(0, int(period_usage.get(usage_type, 0) or 0)) + 1
        write_billing_store(store)


def save_subscription(user_id: str, status: str, customer_id: str = '', subscription_id: str = '', period_end: int = 0, billing_plan: str = ''):
    normalized_user_id = normalize_user_id(user_id)
    with BILLING_STORE_LOCK:
        store = read_billing_store()
        user = store.setdefault('users', {}).setdefault(normalized_user_id, {})
        user.update({
            'status': status,
            'customer_id': customer_id or user.get('customer_id', ''),
            'subscription_id': subscription_id or user.get('subscription_id', ''),
            'period_end': int(period_end or user.get('period_end', 0)),
            'billing_plan': billing_plan or user.get('billing_plan', ''),
            'updated_at': int(time.time())
        })
        write_billing_store(store)


def stripe_api_request(method: str, path: str, params: dict | None = None) -> dict:
    if not STRIPE_SECRET_KEY:
        raise RuntimeError('Stripe er ikke konfigureret endnu.')
    body = urlencode(params or {}).encode('utf-8') if params is not None else None
    request_obj = urllib.request.Request(
        f'https://api.stripe.com/v1/{path.lstrip("/")}',
        data=body,
        headers={
            'Authorization': f'Bearer {STRIPE_SECRET_KEY}',
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        method=method
    )
    try:
        with urllib.request.urlopen(request_obj, timeout=20) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        try:
            message = json.loads(exc.read().decode('utf-8')).get('error', {}).get('message', '')
        except (ValueError, UnicodeDecodeError):
            message = ''
        raise RuntimeError(message or 'Stripe kunne ikke gennemføre handlingen.') from None


def validate_annual_checkout_offer():
    annual_price = stripe_api_request('GET', f'prices/{STRIPE_ANNUAL_PRICE_ID}')
    recurring = annual_price.get('recurring') or {}
    valid_annual_price = (
        annual_price.get('active') is True
        and str(annual_price.get('currency') or '').lower() == 'dkk'
        and int(annual_price.get('unit_amount') or 0) == PRO_ANNUAL_PRICE_DKK * 100
        and recurring.get('interval') == 'year'
        and int(recurring.get('interval_count') or 0) == 1
    )
    annual_coupon = stripe_api_request('GET', f'coupons/{STRIPE_ANNUAL_DISCOUNT_COUPON_ID}')
    valid_annual_coupon = (
        annual_coupon.get('valid') is True
        and float(annual_coupon.get('percent_off') or 0) == PRO_ANNUAL_DISCOUNT_PERCENT
        and annual_coupon.get('duration') == 'once'
    )
    if not valid_annual_price or not valid_annual_coupon:
        raise RuntimeError('Årstilbuddet skal være 468 DKK/år med 40 procent rabat på første faktura.')


def validate_weekly_checkout_price():
    weekly_price = stripe_api_request('GET', f'prices/{STRIPE_WEEKLY_PRICE_ID}')
    recurring = weekly_price.get('recurring') or {}
    if not (
        weekly_price.get('active') is True
        and str(weekly_price.get('currency') or '').lower() == 'dkk'
        and int(weekly_price.get('unit_amount') or 0) == PRO_WEEKLY_PRICE_DKK * 100
        and recurring.get('interval') == 'week'
        and int(recurring.get('interval_count') or 0) == 1
    ):
        raise RuntimeError('Ugeabonnementet skal være 20 DKK pr. uge.')


def create_checkout_session(user_id: str, billing_plan: str = 'monthly') -> dict:
    normalized_user_id = normalize_user_id(user_id)
    normalized_plan = (billing_plan or 'monthly').strip().lower()
    if normalized_plan not in ('weekly', 'monthly', 'annual'):
        raise ValueError('Vælg uge-, måneds- eller årsabonnement.')
    if not STRIPE_SECRET_KEY or not STRIPE_WEBHOOK_SECRET:
        raise RuntimeError('Stripe Checkout mangler secret key eller webhook-secret.')
    if normalized_plan == 'annual':
        if not STRIPE_ANNUAL_PRICE_ID or not STRIPE_ANNUAL_DISCOUNT_COUPON_ID:
            raise RuntimeError('Årsabonnementet klargøres stadig.')
        price_id = STRIPE_ANNUAL_PRICE_ID
    elif normalized_plan == 'weekly':
        if not STRIPE_WEEKLY_PRICE_ID:
            raise RuntimeError('Ugeabonnementet klargøres stadig.')
        price_id = STRIPE_WEEKLY_PRICE_ID
    else:
        if not STRIPE_PRICE_ID:
            raise RuntimeError('Månedsabonnementet klargøres stadig.')
        price_id = STRIPE_PRICE_ID
    if get_billing_status(normalized_user_id)['is_pro']:
        raise RuntimeError('Brugeren har allerede Pro.')
    if normalized_plan == 'annual':
        validate_annual_checkout_offer()
    elif normalized_plan == 'weekly':
        validate_weekly_checkout_price()
    checkout_params = {
        'mode': 'subscription',
        'client_reference_id': normalized_user_id,
        'line_items[0][price]': price_id,
        'line_items[0][quantity]': '1',
        'metadata[user_id]': normalized_user_id,
        'metadata[billing_plan]': normalized_plan,
        'subscription_data[metadata][user_id]': normalized_user_id,
        'subscription_data[metadata][billing_plan]': normalized_plan,
        'success_url': f'{PUBLIC_APP_URL}/?checkout=success&session_id={{CHECKOUT_SESSION_ID}}#pro',
        'cancel_url': f'{PUBLIC_APP_URL}/?checkout=cancelled#pro',
        'locale': 'da'
    }
    if normalized_plan == 'annual':
        checkout_params['discounts[0][coupon]'] = STRIPE_ANNUAL_DISCOUNT_COUPON_ID
    else:
        checkout_params['allow_promotion_codes'] = 'true'
    return stripe_api_request('POST', 'checkout/sessions', checkout_params)


def confirm_checkout_session(session_id: str, user_id: str) -> dict:
    normalized_user_id = normalize_user_id(user_id)
    clean_session_id = (session_id or '').strip()
    if not clean_session_id.startswith('cs_') or len(clean_session_id) > 160:
        raise ValueError('Invalid checkout session')
    session = stripe_api_request('GET', f'checkout/sessions/{clean_session_id}')
    if session.get('client_reference_id') != normalized_user_id:
        raise ValueError('Checkout session does not belong to this user')
    if session.get('status') != 'complete' or session.get('payment_status') not in ('paid', 'no_payment_required'):
        raise RuntimeError('Betalingen er ikke gennemført endnu.')
    save_subscription(
        normalized_user_id,
        'active',
        str(session.get('customer') or ''),
        str(session.get('subscription') or ''),
        billing_plan=str(session.get('metadata', {}).get('billing_plan') or '')
    )
    return get_billing_status(normalized_user_id)


def create_billing_portal_session(user_id: str, billing_plan: str = '') -> dict:
    normalized_user_id = normalize_user_id(user_id)
    if is_owner_user(normalized_user_id):
        raise RuntimeError('Ejeradgangen er permanent og har intet Stripe-abonnement.')
    user = read_billing_store().get('users', {}).get(normalized_user_id, {})
    customer_id = str(user.get('customer_id') or '')
    subscription_id = str(user.get('subscription_id') or '')
    if user.get('status') not in ('active', 'trialing') or not customer_id.startswith('cus_') or not subscription_id.startswith('sub_'):
        raise RuntimeError('Der blev ikke fundet et aktivt Pro-abonnement.')
    portal_params = {
        'customer': customer_id,
        'return_url': f'{PUBLIC_APP_URL}/#pro'
    }
    if STRIPE_PORTAL_CONFIGURATION_ID:
        portal_params['configuration'] = STRIPE_PORTAL_CONFIGURATION_ID
    normalized_plan = (billing_plan or '').strip().lower()
    if normalized_plan:
        plan_prices = {
            'weekly': STRIPE_WEEKLY_PRICE_ID,
            'monthly': STRIPE_PRICE_ID,
            'annual': STRIPE_ANNUAL_PRICE_ID
        }
        if normalized_plan not in plan_prices:
            raise ValueError('Vælg uge-, måneds- eller årsabonnement.')
        if not billing_plan_configuration()[normalized_plan] or not plan_prices[normalized_plan]:
            raise RuntimeError('Den valgte abonnementsplan klargøres stadig.')
        if normalized_plan == 'annual':
            validate_annual_checkout_offer()
        elif normalized_plan == 'weekly':
            validate_weekly_checkout_price()
        subscription = stripe_api_request('GET', f'subscriptions/{subscription_id}')
        subscription_items = subscription.get('items', {}).get('data', [])
        if len(subscription_items) != 1:
            raise RuntimeError('Abonnementet kan ikke skiftes automatisk. Åbn den almindelige Stripe-portal.')
        subscription_item = subscription_items[0]
        current_price = subscription_item.get('price') or {}
        current_price_id = str(current_price.get('id') if isinstance(current_price, dict) else current_price)
        if current_price_id != plan_prices[normalized_plan]:
            portal_params.update({
                'flow_data[type]': 'subscription_update_confirm',
                'flow_data[subscription_update_confirm][subscription]': subscription_id,
                'flow_data[subscription_update_confirm][items][0][id]': str(subscription_item.get('id') or ''),
                'flow_data[subscription_update_confirm][items][0][quantity]': '1',
                'flow_data[subscription_update_confirm][items][0][price]': plan_prices[normalized_plan],
                'flow_data[after_completion][type]': 'redirect',
                'flow_data[after_completion][redirect][return_url]': f'{PUBLIC_APP_URL}/?plan_changed=1#pro'
            })
            if normalized_plan == 'annual':
                portal_params['flow_data[subscription_update_confirm][discounts][0][coupon]'] = STRIPE_ANNUAL_DISCOUNT_COUPON_ID
    return stripe_api_request('POST', 'billing_portal/sessions', portal_params)


def subscription_billing_plan(subscription: dict) -> str:
    items = subscription.get('items', {}).get('data', [])
    if items:
        price = items[0].get('price') or {}
        price_id = str(price.get('id') if isinstance(price, dict) else price)
        for plan_name, configured_price_id in (
            ('weekly', STRIPE_WEEKLY_PRICE_ID),
            ('monthly', STRIPE_PRICE_ID),
            ('annual', STRIPE_ANNUAL_PRICE_ID)
        ):
            if configured_price_id and hmac.compare_digest(price_id, configured_price_id):
                return plan_name
    metadata_plan = str(subscription.get('metadata', {}).get('billing_plan') or '')
    return metadata_plan if metadata_plan in ('weekly', 'monthly', 'annual') else ''


def verify_stripe_signature(payload: bytes, signature_header: str):
    if not STRIPE_WEBHOOK_SECRET:
        raise ValueError('Stripe webhook is not configured')
    parts = {}
    for item in (signature_header or '').split(','):
        key, separator, value = item.partition('=')
        if separator:
            parts.setdefault(key, []).append(value)
    try:
        timestamp = int(parts.get('t', ['0'])[0])
    except ValueError:
        raise ValueError('Invalid Stripe signature') from None
    if abs(int(time.time()) - timestamp) > 300:
        raise ValueError('Expired Stripe signature')
    signed_payload = f'{timestamp}.'.encode('ascii') + payload
    expected = hmac.new(STRIPE_WEBHOOK_SECRET.encode('utf-8'), signed_payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, signature) for signature in parts.get('v1', [])):
        raise ValueError('Invalid Stripe signature')


def handle_stripe_event(event: dict):
    event_type = str(event.get('type') or '')
    resource = event.get('data', {}).get('object', {})
    if event_type == 'checkout.session.completed':
        user_id = resource.get('client_reference_id') or resource.get('metadata', {}).get('user_id')
        if user_id and resource.get('payment_status') in ('paid', 'no_payment_required'):
            save_subscription(
                user_id,
                'active',
                str(resource.get('customer') or ''),
                str(resource.get('subscription') or ''),
                billing_plan=str(resource.get('metadata', {}).get('billing_plan') or '')
            )
        return
    if event_type in ('customer.subscription.updated', 'customer.subscription.deleted'):
        user_id = resource.get('metadata', {}).get('user_id')
        if user_id:
            status = str(resource.get('status') or 'inactive')
            if event_type == 'customer.subscription.deleted':
                status = 'canceled'
            save_subscription(
                user_id,
                status,
                str(resource.get('customer') or ''),
                str(resource.get('id') or ''),
                int(resource.get('current_period_end') or 0),
                subscription_billing_plan(resource)
            )


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
        return 'Spørg mig om træning, mad, kcal, vægt, billeder eller andre funktioner i All In One Fitness.'
    return (
        "Jeg kan kun hjælpe med funktionerne og dine registreringer i All In One Fitness: "
        "træning, mad, kcal, vægt, kropsbilleder og tilknyttede sundhedsdata."
    )


def call_openai(question: str, context: dict | None = None, images: list[str] | None = None) -> str:
    if not OPENAI_API_KEY:
        raise RuntimeError('No OpenAI API key configured')

    user_content = question
    if images:
        user_content = [{'type': 'text', 'text': question}]
        for image in images[:6]:
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
                'Du er den danske AI-coach inde i All In One Fitness. '
                'Besvar kun spørgsmål om appens funktioner eller brugerens medsendte appdata om træning, mad, kcal, vægt, kropsbilleder, søvn, restitution og tilknyttede sundhedsdata. '
                'Hvis spørgsmålet ikke handler om All In One Fitness eller disse data, skal du kort forklare, at du kun kan hjælpe inde i appens område. '
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
        'temperature': 0.7,
        'max_tokens': OPENAI_MAX_OUTPUT_TOKENS
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
                    'Du er den lokale AI-coach inde i All In One Fitness. '
                    'Besvar kun spørgsmål om appens funktioner eller brugerens medsendte appdata om træning, mad, kcal, vægt, kropsbilleder, søvn, restitution og tilknyttede sundhedsdata. '
                    'Afvis kort spørgsmål uden for appens område. '
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

    def client_id(self) -> str:
        forwarded_for = self.headers.get('X-Forwarded-For', '')
        return (forwarded_for.split(',', 1)[0].strip() if forwarded_for else '') or self.client_address[0]

    def require_same_origin(self) -> bool:
        if self.headers.get('Sec-Fetch-Site', '').lower() == 'cross-site':
            self.send_json({'ok': False, 'message': 'Cross-site request rejected.'}, 403)
            return False
        origin = self.headers.get('Origin', '').rstrip('/')
        if not origin:
            return True
        forwarded_host = self.headers.get('X-Forwarded-Host', '').split(',', 1)[0].strip()
        host = forwarded_host or self.headers.get('Host', '').strip()
        forwarded_proto = self.headers.get('X-Forwarded-Proto', '').split(',', 1)[0].strip().lower()
        scheme = forwarded_proto or ('https' if self.headers.get('X-Forwarded-Ssl', '').lower() == 'on' else 'http')
        allowed_origins = {f'{scheme}://{host}'.rstrip('/'), PUBLIC_APP_URL}
        if origin not in allowed_origins:
            self.send_json({'ok': False, 'message': 'Cross-site request rejected.'}, 403)
            return False
        return True

    def enforce_rate_limit(self, scope: str, limit: int) -> bool:
        if rate_limit_exceeded(scope, self.client_id(), limit):
            self.send_json({'ok': False, 'code': 'rate_limited', 'message': 'For mange forsøg. Vent et øjeblik og prøv igen.'}, 429)
            return False
        return True

    def checked_content_length(self, max_bytes: int, too_large_message: str = 'Request body is too large') -> int | None:
        try:
            content_length = int(self.headers.get('Content-Length', '0') or 0)
        except (TypeError, ValueError):
            self.send_json({'ok': False, 'message': 'Invalid Content-Length'}, 400)
            return None
        if content_length <= 0:
            self.send_json({'ok': False, 'message': 'Invalid request body'}, 400)
            return None
        if content_length > max_bytes:
            self.send_json({'ok': False, 'message': too_large_message}, 413)
            return None
        return content_length

    def cookie_value(self, name: str) -> str:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
        except CookieError:
            return ''
        value = cookie.get(name)
        return value.value if value else ''

    def queue_cookie(self, name: str, value: str, max_age: int):
        secure = ' Secure;' if self.headers.get('X-Forwarded-Proto', '').lower() == 'https' else ''
        cookie = f'{name}={value}; Path=/; Max-Age={max(0, int(max_age))}; HttpOnly; SameSite=Lax;{secure}'
        self._pending_response_headers = getattr(self, '_pending_response_headers', [])
        self._pending_response_headers.append(('Set-Cookie', cookie))

    def set_auth_session(self, session: dict):
        access_token = str(session.get('access_token') or '')
        refresh_token = str(session.get('refresh_token') or '')
        if access_token and refresh_token:
            self.queue_cookie(AUTH_ACCESS_COOKIE, access_token, int(session.get('expires_in') or 3600))
            self.queue_cookie(AUTH_REFRESH_COOKIE, refresh_token, 60 * 60 * 24 * 30)

    def clear_auth_session(self):
        self.queue_cookie(AUTH_ACCESS_COOKIE, '', 0)
        self.queue_cookie(AUTH_REFRESH_COOKIE, '', 0)

    def local_developer_user(self) -> dict:
        host = self.headers.get('Host', '').split(':', 1)[0].lower()
        loopback_hosts = {'localhost', '127.0.0.1', '::1', '[::1]'}
        loopback_clients = {'127.0.0.1', '::1'}
        if not LOCAL_DEV_AUTH or not OWNER_USER_ID:
            return {}
        if host not in loopback_hosts or self.client_address[0] not in loopback_clients:
            return {}
        return {'id': OWNER_USER_ID, 'email': LOCAL_DEV_USER_EMAIL}

    def authenticated_user(self) -> dict:
        local_user = self.local_developer_user()
        if local_user:
            return local_user
        access_token = self.cookie_value(AUTH_ACCESS_COOKIE)
        if access_token:
            try:
                user = supabase_auth_request('/auth/v1/user', access_token=access_token)
                if user.get('id'):
                    return user
            except (SupabaseAuthError, RuntimeError):
                pass

        refresh_token = self.cookie_value(AUTH_REFRESH_COOKIE)
        if not refresh_token:
            return {}
        try:
            session = supabase_auth_request(
                '/auth/v1/token?grant_type=refresh_token',
                method='POST',
                payload={'refresh_token': refresh_token}
            )
            self.set_auth_session(session)
            user = session.get('user') or {}
            return user if user.get('id') else {}
        except (SupabaseAuthError, RuntimeError):
            self.clear_auth_session()
            return {}

    def require_pro_user(self) -> str | None:
        user = self.authenticated_user()
        if APP_OPEN_ACCESS and not user:
            return normalize_user_id(f'guest-{self.client_address[0]}')
        if not user:
            self.send_json({'ok': False, 'code': 'auth_required', 'message': 'Log ind for at forbinde sundhedsdata.'}, 401)
            return None
        user_id = normalize_user_id(str(user['id']))
        billing_status = get_billing_status(user_id)
        if not billing_status['is_pro']:
            self.send_json({
                'ok': False,
                'code': 'pro_required',
                'message': 'KRÆVER PRO: sundhedsdata og Withings er låst.',
                'billing': billing_status
            }, 402)
            return None
        return user_id

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
                'auth_configured': bool(SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY),
                'billing_configured': any(billing_plan_configuration().values()),
                'billing_environment': BILLING_ENVIRONMENT,
                'billing_test_mode': BILLING_ENVIRONMENT == 'test',
                'withings_configured': bool(WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET),
                'persistent_token_store': bool(RAILWAY_VOLUME_PATH or os.environ.get('TOKEN_STORE_PATH'))
            })
            return

        if parsed.path == '/api/auth/session':
            user = self.authenticated_user()
            self.send_json({
                'ok': True,
                'configured': bool(SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY),
                'billing_configured': any(billing_plan_configuration().values()),
                'billing_environment': BILLING_ENVIRONMENT,
                'test_mode': BILLING_ENVIRONMENT == 'test',
                'authenticated': bool(user),
                'user': {'id': user.get('id'), 'email': user.get('email')} if user else None
            })
            return

        if parsed.path == '/api/billing/status':
            user = self.authenticated_user()
            if not user:
                self.send_json({'ok': False, 'code': 'auth_required', 'message': 'Log ind for at se Pro-status.'}, 401)
                return
            self.send_json({'ok': True, **get_billing_status(str(user['id']))})
            return

        if parsed.path == '/api/provider/status':
            user_id = self.require_pro_user()
            if not user_id:
                return
            withings_token = read_token_store().get('withings_users', {}).get(user_id, {})
            self.send_json({
                'ok': True,
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
            user_id = self.require_pro_user()
            if not user_id:
                return
            try:
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
                    if not get_billing_status(user_id)['is_pro']:
                        self.send_response(302)
                        self.send_header('Location', '/?provider=withings&pro_required=1#pro')
                        self.end_headers()
                        return
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
                user_id = self.require_pro_user()
                if not user_id:
                    return
                try:
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
                user_id = self.require_pro_user()
                if not user_id:
                    return
                try:
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
        if parsed.path == '/api/billing/webhook':
            content_length = self.checked_content_length(1024 * 1024, 'Webhook body is too large')
            if content_length is None:
                return
            raw_body = self.rfile.read(content_length)
            try:
                verify_stripe_signature(raw_body, self.headers.get('Stripe-Signature', ''))
                event = json.loads(raw_body.decode('utf-8'))
                handle_stripe_event(event)
                self.send_json({'ok': True})
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                self.send_json({'ok': False, 'message': str(exc)}, 400)
            return

        if parsed.path.startswith('/api/') and not self.require_same_origin():
            return

        if parsed.path in ('/api/auth/signup', '/api/auth/login', '/api/auth/logout', '/api/auth/exchange'):
            if not self.enforce_rate_limit('auth', AUTH_BURST_LIMIT):
                return
            if parsed.path == '/api/auth/logout':
                access_token = self.cookie_value(AUTH_ACCESS_COOKIE)
                if access_token:
                    try:
                        supabase_auth_request('/auth/v1/logout', method='POST', access_token=access_token)
                    except (SupabaseAuthError, RuntimeError):
                        pass
                self.clear_auth_session()
                self.send_json({'ok': True, 'authenticated': False})
                return

            content_length = self.checked_content_length(65536)
            if content_length is None:
                return
            try:
                payload = json.loads(self.rfile.read(content_length).decode('utf-8'))
                if parsed.path == '/api/auth/exchange':
                    refresh_token = str(payload.get('refresh_token') or '')
                    if not refresh_token or len(refresh_token) > 4096:
                        raise ValueError('Bekræftelseslinket er ugyldigt eller udløbet.')
                    session = supabase_auth_request(
                        '/auth/v1/token?grant_type=refresh_token',
                        method='POST',
                        payload={'refresh_token': refresh_token}
                    )
                else:
                    email = str(payload.get('email') or '').strip().lower()
                    password = str(payload.get('password') or '')
                    if '@' not in email or len(email) > 254:
                        raise ValueError('Skriv en gyldig e-mailadresse.')
                    if len(password) < 8 or len(password) > 128:
                        raise ValueError('Adgangskoden skal være mellem 8 og 128 tegn.')
                    if parsed.path == '/api/auth/signup':
                        redirect_query = urlencode({'redirect_to': PUBLIC_APP_URL})
                        session = supabase_auth_request(
                            f'/auth/v1/signup?{redirect_query}',
                            method='POST',
                            payload={'email': email, 'password': password}
                        )
                    else:
                        session = supabase_auth_request(
                            '/auth/v1/token?grant_type=password',
                            method='POST',
                            payload={'email': email, 'password': password}
                        )
                self.set_auth_session(session)
                user = session.get('user') or session
                authenticated = bool(session.get('access_token'))
                self.send_json({
                    'ok': True,
                    'authenticated': authenticated,
                    'confirmation_required': not authenticated,
                    'user': {'id': user.get('id'), 'email': user.get('email')} if user.get('id') else None
                })
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                self.send_json({'ok': False, 'message': str(exc)}, 400)
            except SupabaseAuthError as exc:
                self.send_json({'ok': False, 'message': str(exc)}, exc.status)
            except RuntimeError as exc:
                self.send_json({'ok': False, 'message': str(exc)}, 503)
            return

        if parsed.path in ('/api/billing/checkout', '/api/billing/confirm', '/api/billing/portal'):
            if not self.enforce_rate_limit('billing', BILLING_BURST_LIMIT):
                return
            user = self.authenticated_user()
            if not user:
                self.send_json({'ok': False, 'code': 'auth_required', 'message': 'Log ind for at administrere Pro.'}, 401)
                return
            content_length = self.checked_content_length(65536)
            if content_length is None:
                return
            try:
                payload = json.loads(self.rfile.read(content_length).decode('utf-8'))
                user_id = normalize_user_id(str(user['id']))
                if parsed.path == '/api/billing/checkout':
                    session = create_checkout_session(user_id, str(payload.get('plan') or 'monthly'))
                    self.send_json({'ok': True, 'url': session.get('url'), 'session_id': session.get('id')})
                elif parsed.path == '/api/billing/confirm':
                    status = confirm_checkout_session(str(payload.get('session_id') or ''), user_id)
                    self.send_json({'ok': True, **status})
                else:
                    session = create_billing_portal_session(user_id, str(payload.get('plan') or ''))
                    self.send_json({'ok': True, 'url': session.get('url')})
            except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                self.send_json({'ok': False, 'message': str(exc)}, 400)
            except RuntimeError as exc:
                self.send_json({'ok': False, 'message': str(exc)}, 503)
            return

        if parsed.path == '/api/provider/disconnect':
            user = self.authenticated_user()
            if not user:
                self.send_json({'ok': False, 'code': 'auth_required', 'message': 'Log ind for at fjerne sundhedsdata.'}, 401)
                return
            user_id = normalize_user_id(str(user['id']))
            delete_provider_token('withings', user_id)
            self.send_json({'ok': True, 'provider': 'withings', 'disconnected': True})
            return
        if parsed.path != '/api/coach':
            self.send_error(404, 'Not found')
            return

        if not self.enforce_rate_limit('coach', COACH_BURST_LIMIT):
            return
        content_length = self.checked_content_length(MAX_COACH_REQUEST_BYTES, 'AI request is too large')
        if content_length is None:
            return
        user = self.authenticated_user()
        if not user and not APP_OPEN_ACCESS:
            self.send_json({'ok': False, 'code': 'auth_required', 'message': 'Log ind for at bruge online AI.'}, 401)
            return
        raw_body = self.rfile.read(content_length)
        try:
            payload = json.loads(raw_body.decode('utf-8')) if raw_body else {}
        except json.JSONDecodeError:
            payload = {}

        question = str(payload.get('question', '')).strip()
        context = payload.get('context') or {}
        images = payload.get('images')[:6] if isinstance(payload.get('images'), list) else []
        user_id = normalize_user_id(str(user['id'])) if user else normalize_user_id(f'guest-{self.client_address[0]}')
        usage_type = 'vision' if images else 'coach'
        billing_status = get_billing_status(user_id)
        if not APP_OPEN_ACCESS and not billing_status['is_pro']:
            self.send_json({
                'ok': False,
                'code': 'pro_required',
                'message': 'Pro til 39 kr./måned kræves for online AI.',
                'billing': billing_status
            }, 402)
            return
        if billing_status['remaining'][usage_type] <= 0:
            self.send_json({
                'ok': False,
                'code': 'quota_exceeded',
                'message': 'Din månedlige Pro-kvote er brugt.',
                'billing': billing_status
            }, 429)
            return
        answer, provider = generate_answer(question, context, images)
        if provider == 'openai':
            record_ai_usage(user_id, usage_type)
        self.send_json({'answer': answer, 'provider': provider, 'billing': get_billing_status(user_id)})

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

    def send_json(self, payload: dict, status: int = 200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        for name, value in getattr(self, '_pending_response_headers', []):
            self.send_header(name, value)
        self._pending_response_headers = []
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    validate_billing_environment()
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
