import json
with open('transcripts.json', 'r') as file:
    data = json.load(file)
for invoice in data:
    willing_to_pay_index = next((i for i, answer in enumerate(invoice['answers']) if answer['question'] == "Was the debtor willing to pay?"), None)
    if willing_to_pay_index is not None:
        willing_to_pay = invoice['answers'].pop(willing_to_pay_index)
        willing_to_pay['answer'] = 'High' if willing_to_pay['answer'] else 'Low'
        invoice['answers'].insert(0, willing_to_pay)
with open('transcripts.json', 'w') as file:
    json.dump(data, file, indent=2)
