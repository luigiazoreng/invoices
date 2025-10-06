frappe.ui.form.on("Invoices", "onload", async (form) => {
    const operationNatureToNamingSeries = {
        "Retorno de Remessa para Conserto": "INV-WRN-RR-.YYYY.-",
        "Remessa para Conserto": "INV-WRN-RE-.YYYY.-",
        "Retorno de Troca em Garantia": "INV-WRN-TR-.YYYY.-",
        "Troca em Garantia": "INV-WRN-TE-.YYYY.-",
        Bonificação: "INV-WRN-BE-.YYYY.-",
        "Devolução de Mercadoria de Bonificação": "INV-WRN-BR-.YYYY.-",
    };
    form.set_df_property("naming_series", "options", Object.values(operationNatureToNamingSeries));
});
frappe.ui.form.on("WA Invoice Item", {
    refresh: function (frm) {
        sumTotalItems(frm);
    },
    serial_no: function (frm, cdt, cdn) {
        let row = frappe.get_doc(cdt, cdn);
        if (!row || row.serial_no.length < 1) {
            return;
        }
        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "Serial No",
                filters: {
                    name: row.serial_no
                }
            },
            callback: function (response) {
                if (!response) {
                    console.error("Failed to retrieve serial number details");
                    return;
                }
                frappe.call({
                    method: "frappe.client.get",
                    args: {
                        doctype: "Item",
                        filters: {
                            name: response.message.item_code
                        }
                    },
                    callback: function (response) {
                        if (!response) {
                            console.error("Failed to retrieve serial number details");
                            return;
                        }
                        const item = response.message;
                        row.item_code = item.item_code;
                        row.item_name = item.item_name;
                        row.amount = row.amount ?? 1;
                        row.rate = item.valuation_rate ?? 0;
                        row.rate_taxes = item.valuation_rate ?? 0;
                        frm.refresh_field("items");
                        sumTotalItems(frm);
                    }
                });
            }
        });
        console.log("Serial number changed:", row.serial_no);
    },
    invoice_taxes: async function (frm, cdt, cdn) {
        const row = frappe.get_doc(cdt, cdn);
        if (!row) {
            return;
        }
        if (row.invoice_taxes.length < 1) {
            return;
        }
        const taxes = await taxescalc(row.invoice_taxes, row);
        console.log(row.invoice_taxes);
        if (!taxes) {
            console.error("Failed to calculate taxes");
            return;
        }
        row.rate_taxes = (taxes.ipi + taxes.icms + taxes.pis + taxes.cofins) + row.rate;
        frm.refresh_field("items");
        sumTotalItems(frm);
    },
    amount: function (frm, cdt, cdn) {
        const row = frappe.get_doc(cdt, cdn);
        if (!row) {
            return;
        }
        frm.refresh_field("items");
        sumTotalItems(frm);
    },
});
function sumTotalItems(frm) {
    var total_rate = frm.doc.items.reduce(function (sum, item) {
        return sum + ((item.rate * item.amount) || 0);
    }, 0);
    var total_rate_with_taxes = frm.doc.items.reduce(function (sum, item) {
        return sum + ((item.rate_taxes * item.amount) || 0);
    }, 0);
    frm.set_value("total", total_rate);
    frm.set_value("total_impostos", total_rate_with_taxes);
}
async function taxescalc(name, InvoiceItem) {
    let doc;
    await frappe.call({
        method: "frappe.client.get",
        args: {
            doctype: "Invoice Taxes",
            name: name
        },
        callback: function (response) {
            if (!response || !response.message) {
                console.error("Failed to retrieve invoice tax document");
            }
            else {
                doc = response.message;
            }
        }
    });
    if (!doc) {
        console.error("Failed to retrieve invoice tax document");
        return;
    }
    let ipi = calcSimpleTaxes(InvoiceItem.rate, doc?.aliquota_ipi ?? 0);
    let icms = calcSimpleTaxes(InvoiceItem.rate, doc?.aliq_icms ?? 0);
    if (doc.adiciona_ipi_icms == 1) {
        icms += calcSimpleTaxes(InvoiceItem.rate, doc?.aliquota_ipi ?? 0);
    }
    let pis = calcSimpleTaxes(InvoiceItem.rate, doc?.aliquota_pis ?? 0);
    let cofins = calcSimpleTaxes(InvoiceItem.rate, doc?.aliquota_cofins ?? 0);
    console.log("Aliquotas: Ipi: %d, Icms: %d, Pis: %d, Cofins: %d", ipi, icms, pis, cofins);
    console.log({ ipi, icms, pis, cofins });
    return { ipi, icms, pis, cofins };
}
function calcSimpleTaxes(value, tax) {
    return (value * tax) / 100;
}
function difalCalc(baseCalc, aliquotaInternal, aliquotaInterState, icmsOrig) {
    const icmsIntState = aliquotaInterState / 100;
    const icmsInternal = aliquotaInternal / 100;
    const difal = (((baseCalc - icmsOrig) / (1 - icmsInternal)) * icmsInternal) - baseCalc * icmsIntState;
    return difal;
}
//# sourceMappingURL=onload.js.map