from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from .blockchain import inspect_bsc_wallet_transfer


class BscWalletTransferInspectorTests(SimpleTestCase):
    @override_settings(
        BSC_RPC_URL="https://bsc.example/rpc",
        USDT_BSC_CONTRACT="0x55d398326f99059fF775485246999027B3197955",
    )
    @patch("billing.blockchain._rpc")
    def test_inspector_accepts_confirmed_usdt_transfer_to_wallet(self, rpc):
        wallet = "0xd34D15736148C0e9DC185CCf2D94B648c48e1CdB"
        tx_hash = "0x6c840221a6c25100aeb316071e8315c05ef5ae1b3abc31e6774b5beccf2f9798"
        rpc.side_effect = [
            {
                "status": "0x1",
                "blockNumber": "0x420724c",
                "logs": [{
                    "address": "0x55d398326f99059fF775485246999027B3197955",
                    "topics": [
                        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
                        "0x00000000000000000000000086515636b82666bd764aa6f63594490044d8a1bb",
                        "0x000000000000000000000000d34d15736148c0e9dc185ccf2d94b648c48e1cdb",
                    ],
                    "data": "0x10a741a462780000",
                    "logIndex": "0x17",
                }],
            },
            "0x4207256",
            {"timestamp": "0x692330ba"},
        ]

        result = inspect_bsc_wallet_transfer(tx_hash, wallet=wallet)

        self.assertTrue(result["found"])
        self.assertTrue(result["matched_wallet"])
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["matching_transfers"][0]["amount"], "1.2")
        self.assertEqual(result["matching_transfers"][0]["to"], wallet.lower())

    @override_settings(BSC_RPC_URL="https://bsc.example/rpc")
    @patch("billing.blockchain._rpc", return_value=None)
    def test_inspector_reports_missing_transaction_without_throwing(self, rpc):
        result = inspect_bsc_wallet_transfer(
            "0x6c840221a6c25100aeb316071e8315c05ef5ae1b3abc31e6774b5beccf2f9798",
            wallet="0xd34D15736148C0e9DC185CCf2D94B648c48e1CdB",
        )

        self.assertFalse(result["found"])
        self.assertFalse(result["matched_wallet"])
        self.assertIn("not found", result["reason"])
