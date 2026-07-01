sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.InwardInsuranceList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ results: [] }), "inwardInsuranceList");
			this.getRouter().getRoute("InwardInsuranceList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._loadList();
		},

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			var that = this;

			if (!oODataModel) {
				MessageBox.error("SAP system is not connected.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/ZInwardInsuranceSet", {
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					var aList = oData.results || [];
					that.getView().getModel("inwardInsuranceList").setProperty("/results", aList);
				},
				error: function () {
					sap.ui.core.BusyIndicator.hide();
					MessageBox.error("Failed to load Inward Insurance list.");
					that.getView().getModel("inwardInsuranceList").setProperty("/results", []);
				}
			});
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onRowPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("inwardInsuranceList").getObject();
			if (!oItem) { return; }

			// Core model caching to avoid reloading read-only data
			sap.ui.getCore().setModel(new JSONModel(oItem), "selectedInwardInsurance");
			
			this.getRouter().navTo("AddInwardInsurance", {
				invoiceNo: encodeURIComponent(oItem.InvoiceNumber || "")
			});
		},

		onDateFilterChange: function () {
			this._applyFilters();
		},

		onSearch: function () {
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("inwardInsuranceTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) { return; }

			var aFilters = [];

			// 1. Text Search Filter
			var sSearch = this.byId("inwardInsuranceTable").getHeaderToolbar().getContent().find(function(c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			}).getValue().trim();

			if (sSearch) {
				var sLow = sSearch.toLowerCase();
				aFilters.push(new Filter({
					path: "InvoiceNumber",
					test: function(v, oContext) {
						var o = oContext ? oContext.getObject() : {};
						return [
							(o.InvoiceNumber || ""),
							(o.VendorName || ""),
							(o.LRNumber || ""),
							(o.VehicleNo || ""),
							(o.RGPCoomonDesc || "")
						].some(function(f) { return String(f).toLowerCase().indexOf(sLow) !== -1; });
					}
				}));
			}

			// 2. Date Filter (uses InsuranceDate field)
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "InsuranceDate",
					test: function(vDate) {
						if (!vDate) { return false; }
						var oItemDate = new Date(vDate);
						if (isNaN(oItemDate.getTime())) {
							var p = String(vDate).split("-");
							if (p.length === 3) {
								if (p[0].length === 4) {
									oItemDate = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
								} else {
									oItemDate = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
								}
							}
						}
						if (isNaN(oItemDate.getTime())) {
							// Check SAP format YYYYMMDD
							if (typeof vDate === "string" && vDate.length === 8) {
								oItemDate = new Date(parseInt(vDate.substring(0, 4)), parseInt(vDate.substring(4, 6)) - 1, parseInt(vDate.substring(6, 8)));
							}
						}
						if (isNaN(oItemDate.getTime())) { return false; }
						if (oFrom && oItemDate < oFrom) { return false; }
						if (oTo && oItemDate > oTo) { return false; }
						return true;
					}
				}));
			}

			oBinding.filter(aFilters);
		},

		onDownloadExcel: function () {
			var aObjects = this.getView().getModel("inwardInsuranceList").getProperty("/results") || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "InsuranceDate", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var that = this;
			var aRows = aObjects.map(function (o) {
				return {
					"Invoice Number": o.InvoiceNumber || "",
					"Insurance Date": that.formatDate(o.InsuranceDate) || "",
					"Received Date": that.formatDate(o.RecievedDate) || "",
					"Vendor Name": o.VendorName || "",
					"Vendor Address": o.VendorAddress || "",
					"Mode of Transport": o.ModeOfTransport || "",
					"LR Number": o.LRNumber || "",
					"Vehicle No": o.VehicleNo || "",
					"Invoice Value": o.InvoiceValue || "0.00",
					"RGP Common Desc": o.RGPCoomonDesc || ""
				};
			});
			var aParts = ["Inward_Insurance"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx");
		},

		onPrintList: function () {
			var oTable = this.byId("inwardInsuranceTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("inwardInsuranceList").getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Inward Insurance List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Inward Insurance List</h2><table><thead><tr>";
			sHtml += "<th>Invoice Number</th><th>Insurance Date</th><th>Received Date</th><th>Vendor Name</th><th>Mode of Transport</th><th>LR Number</th><th>Vehicle No</th><th>Invoice Value</th><th>Description</th>";
			sHtml += "</tr></thead><tbody>";
			var that = this;
			aObjects.forEach(function (o) {
				sHtml += "<tr>";
				sHtml += "<td>" + (o.InvoiceNumber || "") + "</td>";
				sHtml += "<td>" + (that.formatDate(o.InsuranceDate) || "") + "</td>";
				sHtml += "<td>" + (that.formatDate(o.RecievedDate) || "") + "</td>";
				sHtml += "<td>" + (o.VendorName || "") + "</td>";
				sHtml += "<td>" + (o.ModeOfTransport || "") + "</td>";
				sHtml += "<td>" + (o.LRNumber || "") + "</td>";
				sHtml += "<td>" + (o.VehicleNo || "") + "</td>";
				sHtml += "<td>" + (o.InvoiceValue || "0.00") + "</td>";
				sHtml += "<td>" + (o.RGPCoomonDesc || "") + "</td>";
				sHtml += "</tr>";
			});
			sHtml += "</tbody></table></body></html>";
			var oWindow = window.open("", "_blank");
			oWindow.document.write(sHtml);
			oWindow.document.close();
			oWindow.focus();
			setTimeout(function () { oWindow.print(); oWindow.close(); }, 500);
		},

		onCopyList: function () {
			var oTable = this.byId("inwardInsuranceTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel("inwardInsuranceList").getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["Invoice Number", "Insurance Date", "Received Date", "Vendor Name", "Mode of Transport", "LR Number", "Vehicle No", "Invoice Value", "Description"];
			var aLines = [sHeaders.join("\t")];
			var that = this;
			aObjects.forEach(function (o) {
				aLines.push([
					o.InvoiceNumber || "",
					that.formatDate(o.InsuranceDate) || "",
					that.formatDate(o.RecievedDate) || "",
					o.VendorName || "",
					o.ModeOfTransport || "",
					o.LRNumber || "",
					o.VehicleNo || "",
					o.InvoiceValue || "0.00",
					o.RGPCoomonDesc || ""
				].join("\t"));
			});
			var sText = aLines.join("\n");
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(sText).then(function () {
					sap.m.MessageToast.show("List copied to clipboard.");
				});
			} else {
				var el = document.createElement("textarea");
				el.value = sText;
				document.body.appendChild(el);
				el.select();
				document.execCommand("copy");
				document.body.removeChild(el);
				sap.m.MessageToast.show("List copied to clipboard.");
			}
		},

		formatDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				return vDate.toLocaleDateString('en-GB').split("/").join("-");
			}
			if (typeof vDate === "string") {
				if (vDate.length === 8 && !vDate.includes("-")) {
					return vDate.substr(6, 2) + "-" + vDate.substr(4, 2) + "-" + vDate.substr(0, 4);
				}
				if (vDate.includes("-")) {
					var parts = vDate.split("-");
					if (parts.length === 3) {
						if (parts[0].length === 4) {
							return parts[2] + "-" + parts[1] + "-" + parts[0];
						}
						return parts[0] + "-" + parts[1] + "-" + parts[2];
					}
				}
			}
			return vDate;
		}

	});
});
