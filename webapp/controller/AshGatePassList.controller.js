sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("AshGatePassList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._loadList();
		},

		_loadList: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				sap.m.MessageBox.error("SAP system is not connected. Please contact your administrator.");
			}
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		},

		onDateFilterChange: function () {
			this._applyFilters();
		},

		onSearch: function (oEvent) {
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("ashListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) { return; }

			var aFilters = [];
			
			// Always apply GatePassType eq 'NRGP' filter when using OData
			var oODataModel = this.getOwnerComponent().getModel();
			if (oODataModel && oBinding && oBinding.getModel() === oODataModel) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, "NRGP"));
			}

			// 1. Text Search Filter
			var sSearch = this.byId("ashListTable").getHeaderToolbar().getContent().find(function(c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			}).getValue().trim();

			if (sSearch) {
				var sLow = sSearch.toLowerCase();
				aFilters.push(new Filter({
					path: "GatePassNo",
					test: function(v, oContext) {
						var o = oContext ? oContext.getObject() : {};
						return [
							(o.GatePassNo || ""),
							(o.SalesDocument || ""),
							(o.CustomerName || ""),
							(o.VehicleNo || "")
						].some(function(f) { return String(f).toLowerCase().indexOf(sLow) !== -1; });
					}
				}));
			}

			// 2. Date Filter
			var oFromDate = this.byId("idExcelFromDate").getDateValue();
			var oToDate = this.byId("idExcelToDate").getDateValue();
			if (oFromDate || oToDate) {
				var oFrom = oFromDate ? new Date(oFromDate.getFullYear(), oFromDate.getMonth(), oFromDate.getDate()) : null;
				var oTo = oToDate ? new Date(oToDate.getFullYear(), oToDate.getMonth(), oToDate.getDate(), 23, 59, 59, 999) : null;
				aFilters.push(new Filter({
					path: "GPDate",
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
						if (isNaN(oItemDate.getTime())) { return false; }
						if (oFrom && oItemDate < oFrom) { return false; }
						if (oTo && oItemDate > oTo) { return false; }
						return true;
					}
				}));
			}

			oBinding.filter(aFilters);
		},

		onPrintList: function () {
			var oTable = this.byId("ashListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var sHtml = "<html><head><title>Ash Gate Passes List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Ash Gate Passes List</h2><table><thead><tr>";
			sHtml += "<th>Gate Pass No</th><th>Sales Document</th><th>Customer Name</th><th>Vehicle No</th><th>GP Date</th>";
			sHtml += "</tr></thead><tbody>";
			var that = this;
			aObjects.forEach(function (o) {
				sHtml += "<tr>";
				sHtml += "<td>" + (o.GatePassNo || "") + "</td>";
				sHtml += "<td>" + (o.SalesDocument || "") + "</td>";
				sHtml += "<td>" + (o.CustomerName || "") + "</td>";
				sHtml += "<td>" + (o.VehicleNo || "") + "</td>";
				sHtml += "<td>" + (that.formatDate(o.GPDate) || "") + "</td>";
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
			var oTable = this.byId("ashListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var sHeaders = ["Gate Pass No", "Sales Document", "Customer Name", "Vehicle No", "GP Date"];
			var aLines = [sHeaders.join("\t")];
			var that = this;
			aObjects.forEach(function (o) {
				aLines.push([
					o.GatePassNo || "",
					o.SalesDocument || "",
					o.CustomerName || "",
					o.VehicleNo || "",
					that.formatDate(o.GPDate) || ""
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

		onDownloadExcel: function () {
			var that = this;
			var oTable = this.byId("ashListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) {
						aObjects.push(oContext.getObject());
					}
				});
			}

			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GPDate", dFrom, dTo);

			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var aRows = aObjects.map(function (o) {
				var sApproval = o.Approval1 === "A" ? "Approved" : o.Approval1 === "R" ? "Rejected" : "Pending";
				return {
					"Gate Pass No": o.GatePassNo || "",
					"Request No": o.GatePassReqNo || "",
					"Type": o.GatePassType || "",
					"Sales Document": o.SalesDocument || "",
					"Sold To Party": o.SoldToParty || "",
					"Customer Name": o.CustomerName || "",
					"Customer GST": o.CustomerGst || "",
					"City": o.City || "",
					"Zip Code": o.ZipCode || "",
					"Vehicle No": o.VehicleNo || "",
					"Mode of Dispatch": o.ModeOfDispatch || "",
					"Transporter": o.TransporterName || "",
					"Transporter GST": o.TransporterGst || "",
					"DC Number": o.DCNumber || "",
					"DC Date": that.formatDate(o.DCDate) || "",
					"WB Ticket No": o.WBTicketNo || "",
					"GP Date": that.formatDate(o.GPDate) || "",
					"Remarks": o.Remarks || "",
					"Approval": sApproval
				};
			});
			var aParts = ["Ash_Gate_Pass"];
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx");
		},

		onRowPress: function (oEvent) {
			var oItem = oEvent.getSource();
			if (oItem.getMetadata().getName() === "sap.m.Button") {
				oItem = oItem.getParent();
			}
			var oContext = oItem.getBindingContext();
			var sGPNo = oContext.getProperty("GatePassNo") || oContext.getProperty("requestId") || "";
			
			this.getRouter().navTo("AshGatePassDetail", {
				gpNo: encodeURIComponent(sGPNo)
			});
		},

		formatDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				return vDate.toLocaleDateString('en-GB'); // dd/mm/yyyy
			}
			if (typeof vDate === "string") {
				if (vDate.length === 8 && !vDate.includes("-")) {
					return vDate.substr(6, 2) + "/" + vDate.substr(4, 2) + "/" + vDate.substr(0, 4);
				}
				if (vDate.includes("-")) {
					var parts = vDate.split("-");
					if (parts.length === 3) {
						return parts[2] + "/" + parts[1] + "/" + parts[0];
					}
				}
			}
			return vDate;
		}

	});
});
