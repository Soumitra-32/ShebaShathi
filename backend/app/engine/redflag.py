"""Compare a claimed amount with the verified fee calculator output."""
from .fees import calculate as calculate_fee


def check(claimed_amount, pages=48, validity_years=10, delivery="regular"):
    if claimed_amount < 0:
        raise ValueError("Claimed amount must be zero or greater.")
    fee = calculate_fee(pages, validity_years, delivery)
    official_total = fee["total"]
    difference = round(float(claimed_amount) - official_total, 2)
    difference_pct = round(difference / official_total * 100, 2)
    if difference > 0:
        message = f"উল্লিখিত সরকারি মোট ফি {official_total:,.0f} টাকা; দেওয়া অঙ্কটি {difference:,.0f} টাকা বেশি। সরকারি পেমেন্ট মাধ্যম ব্যবহার করুন।"
    elif difference == 0:
        message = f"অঙ্কটি প্রকাশিত মোট ফির ({official_total:,.0f} টাকা) সমান। সরকারি পোর্টালে আবার যাচাই করুন।"
    else:
        message = f"উল্লিখিত সরকারি ফি {official_total:,.0f} টাকা। দেওয়া অঙ্কটি এই ফির চেয়ে {abs(difference):,.0f} টাকা কম; অর্থ দেওয়ার আগে সরকারি পোর্টালে অঙ্কটি যাচাই করুন।"
    return {
        "official_total": official_total,
        "difference": difference,
        "difference_pct": difference_pct,
        "flag": difference > 0,
        "message_bn": message,
        "source_url": fee["source_url"],
        "last_verified": fee["last_verified"],
    }
