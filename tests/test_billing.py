import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class BillingEnvironmentTests(unittest.TestCase):
    def test_test_mode_rejects_live_credentials_and_production_url(self):
        cases = (
            ('test', 'sk_test_placeholder', 'http://localhost:8010', True),
            ('test', 'sk_live_placeholder', 'http://localhost:8010', False),
            ('test', 'sk_test_placeholder', server.DEFAULT_PUBLIC_APP_URL, False),
            ('live', 'sk_test_placeholder', server.DEFAULT_PUBLIC_APP_URL, False),
        )

        for environment, secret_key, public_url, accepted in cases:
            with self.subTest(environment=environment, secret_key=secret_key[:7], public_url=public_url):
                with patch.multiple(
                    server,
                    BILLING_ENVIRONMENT=environment,
                    STRIPE_SECRET_KEY=secret_key,
                    PUBLIC_APP_URL=public_url,
                ):
                    if accepted:
                        server.validate_billing_environment()
                    else:
                        with self.assertRaises(RuntimeError):
                            server.validate_billing_environment()


class BillingLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        patches = (
            patch.object(server, 'BILLING_STORE_PATH', Path(self.temporary_directory.name) / 'billing.json'),
            patch.object(server, 'OWNER_USER_ID', ''),
            patch.object(server, 'STRIPE_SECRET_KEY', 'sk_test_placeholder'),
            patch.object(server, 'STRIPE_PRICE_ID', 'price_test_monthly'),
            patch.object(server, 'STRIPE_WEBHOOK_SECRET', 'whsec_test'),
        )
        for active_patch in patches:
            active_patch.start()
            self.addCleanup(active_patch.stop)

    def test_paid_checkout_grants_pro_and_deleted_subscription_removes_it(self):
        user_id = 'test-user'
        self.assertFalse(server.get_billing_status(user_id)['is_pro'])

        checkout_session = {
            'id': 'cs_test_paid',
            'client_reference_id': user_id,
            'status': 'complete',
            'payment_status': 'paid',
            'customer': 'cus_test_customer',
            'subscription': 'sub_test_subscription',
            'metadata': {'billing_plan': 'monthly'},
        }
        with patch.object(server, 'stripe_api_request', return_value=checkout_session):
            paid_status = server.confirm_checkout_session('cs_test_paid', user_id)

        self.assertTrue(paid_status['is_pro'])
        self.assertEqual(paid_status['billing_plan'], 'monthly')

        server.handle_stripe_event({
            'type': 'customer.subscription.deleted',
            'data': {
                'object': {
                    'id': 'sub_test_subscription',
                    'customer': 'cus_test_customer',
                    'status': 'canceled',
                    'metadata': {'user_id': user_id, 'billing_plan': 'monthly'},
                    'items': {'data': [{'price': {'id': 'price_test_monthly'}}]},
                }
            },
        })

        self.assertFalse(server.get_billing_status(user_id)['is_pro'])

    def test_unpaid_checkout_does_not_grant_pro(self):
        user_id = 'unpaid-user'
        checkout_session = {
            'client_reference_id': user_id,
            'status': 'open',
            'payment_status': 'unpaid',
            'metadata': {'billing_plan': 'monthly'},
        }
        with patch.object(server, 'stripe_api_request', return_value=checkout_session):
            with self.assertRaises(RuntimeError):
                server.confirm_checkout_session('cs_test_unpaid', user_id)

        self.assertFalse(server.get_billing_status(user_id)['is_pro'])

    def test_weekly_only_configuration_counts_as_available(self):
        user_id = 'plan-user'
        with patch.multiple(
            server,
            STRIPE_SECRET_KEY='sk_test_placeholder',
            STRIPE_WEBHOOK_SECRET='whsec_test',
            STRIPE_PRICE_ID='',
            STRIPE_WEEKLY_PRICE_ID='price_test_weekly',
            STRIPE_ANNUAL_PRICE_ID='',
            STRIPE_ANNUAL_DISCOUNT_COUPON_ID='',
        ):
            status = server.get_billing_status(user_id)
            self.assertTrue(status['configured'])
            self.assertTrue(status['plans']['weekly']['configured'])
            self.assertFalse(status['plans']['annual']['configured'])

    def test_checkout_cannot_activate_another_user(self):
        checkout_session = {
            'client_reference_id': 'first-user',
            'status': 'complete',
            'payment_status': 'paid',
        }
        with patch.object(server, 'stripe_api_request', return_value=checkout_session):
            with self.assertRaises(ValueError):
                server.confirm_checkout_session('cs_test_other_user', 'second-user')

        self.assertFalse(server.get_billing_status('second-user')['is_pro'])


if __name__ == '__main__':
    unittest.main()