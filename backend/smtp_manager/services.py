from .tester import test_smtp

def verify_account(account):
    return test_smtp(account)
