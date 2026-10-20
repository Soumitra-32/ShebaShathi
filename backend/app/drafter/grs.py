"""Factual GRS complaint draft builder. It does not submit or store complaints."""

PORTAL_URL = "https://www.grs.gov.bd/complainWithoutLogin.do"
_TYPE_BN = {
    "delay": "সেবা প্রদানে বিলম্ব",
    "bribe_demand": "অতিরিক্ত অর্থ দাবির অভিযোগ",
    "document_refusal": "নথি গ্রহণে অস্বীকৃতির অভিযোগ",
    "other": "সেবাসংক্রান্ত অভিযোগ",
}
_TYPE_EN = {
    "delay": "Delay in service",
    "bribe_demand": "Request for unofficial payment",
    "document_refusal": "Refusal to accept a document",
    "other": "Service-related complaint",
}


def generate(req):
    description = req.description.strip()
    location = req.location.strip()
    incident_date = req.incident_date.strip()
    official_ref = (req.official_ref or "").strip()
    if req.language == "en":
        subject = f"Passport service complaint: {_TYPE_EN[req.misconduct_type]}"
        reference_line = f"Reference: {official_ref}\n" if official_ref else ""
        body = (
            "To\nThe Grievance Redress Officer\n"
            f"Office: {location}\n\nSubject: {subject}\n\nDear Sir/Madam,\n\n"
            f"I am submitting this complaint about an incident on {incident_date} at {location}.\n"
            f"Type of issue: {_TYPE_EN[req.misconduct_type]}.\n{reference_line}"
            f"My description of what happened is:\n{description}\n\n"
            "Please review the information above and let me know the appropriate action or next step.\n\n"
            "Sincerely,\nName: ____________________\nPhone: ____________________"
        )
        disclaimer = "Draft only. Check every detail and remove anything inaccurate before submitting through the official GRS portal."
    else:
        subject = f"পাসপোর্ট সেবাসংক্রান্ত অভিযোগ: {_TYPE_BN[req.misconduct_type]}"
        reference_line = f"রেফারেন্স: {official_ref}\n" if official_ref else ""
        body = (
            "বরাবর\nঅভিযোগ নিষ্পত্তি কর্মকর্তা\n"
            f"দপ্তর/অফিস: {location}\n\nবিষয়: {subject}\n\nমহোদয়,\n\n"
            f"{incident_date} তারিখে {location}-এ ঘটে যাওয়া একটি সেবাসংক্রান্ত বিষয়ে এই অভিযোগ জানাচ্ছি।\n"
            f"অভিযোগের ধরন: {_TYPE_BN[req.misconduct_type]}।\n{reference_line}"
            f"ঘটনার বিবরণ:\n{description}\n\n"
            "উপরের তথ্যগুলো পর্যালোচনা করে উপযুক্ত ব্যবস্থা বা পরবর্তী করণীয় জানালে কৃতজ্ঞ থাকব।\n\n"
            "বিনীত,\nনাম: ____________________\nমোবাইল নম্বর: ____________________"
        )
        disclaimer = "এটি কেবল একটি খসড়া। জমা দেওয়ার আগে তারিখ, স্থান ও বিবরণ যাচাই করুন; ভুল বা অসমর্থিত তথ্য বাদ দিন।"
    return {"subject": subject, "body": body, "disclaimer": disclaimer, "portal_url": PORTAL_URL}
