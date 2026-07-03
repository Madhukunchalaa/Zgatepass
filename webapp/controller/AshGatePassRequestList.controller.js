sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, JSONModel, Filter, FilterOperator, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AshGatePassRequestList", {

		onInit: function () {
			var oRouter = this.getRouter();
			oRouter.getRoute("AshGatePassRequestList").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
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

		onSearch: function () {
			this._applyFilters();
		},

		onApplyFilters: function () {
			this._applyFilters();
		},

		onClearFilters: function () {
			this.byId("idExcelFromDate").setValue("");
			this.byId("idExcelToDate").setValue("");
			this.byId("idAshStatusFilter").setSelectedKey("");
			var oTable = this.byId("ashReqListTable");
			var oSearch = oTable.getHeaderToolbar().getContent().find(function (c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			});
			if (oSearch) { oSearch.setValue(""); }
			this._applyFilters();
		},

		_applyFilters: function () {
			var oTable = this.byId("ashReqListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			if (!oBinding) return;

			var aFilters = [];
			
			// Always restrict by GatePassType EQ NRGP for ZASH requests
			var oODataModel = this.getOwnerComponent().getModel();
			if (oODataModel && oBinding.getModel() === oODataModel) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, "NRGP"));
			}

			// 1. Search Filter
			var oSearch = oTable.getHeaderToolbar().getContent().find(function (c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			});
			var sQuery = oSearch ? oSearch.getValue().trim() : "";
			if (sQuery) {
				var sLow = sQuery.toLowerCase();
				aFilters.push(new Filter({
					path: "",
					test: function (oValue, oContext) {
						var o = oContext ? oContext.getObject() : oValue;
						if (!o) return false;
						for (var key in o) {
							if (o.hasOwnProperty(key) && o[key] !== null && o[key] !== undefined) {
								if (typeof o[key] === "string" || typeof o[key] === "number" || typeof o[key] === "boolean") {
									if (String(o[key]).toLowerCase().indexOf(sLow) !== -1) { return true; }
								} else if (typeof o[key] === "object") {
									try {
										if (JSON.stringify(o[key]).toLowerCase().indexOf(sLow) !== -1) { return true; }
									} catch (e) {}
								}
							}
						}
						return false;
					}
				}));
			}

			// 2. Status Filter (A1 = Approved, R = Rejected, P = Pending)
			var sStatus = this.byId("idAshStatusFilter").getSelectedKey();
			if (sStatus) {
				if (sStatus === "P") {
					aFilters.push(new Filter({
						path: "Approval1",
						test: function (sVal) {
							return sVal !== "A1" && sVal !== "R";
						}
					}));
				} else {
					aFilters.push(new Filter("Approval1", FilterOperator.EQ, sStatus));
				}
			}

			// 3. Date Range Filter
			var sFrom = this.byId("idExcelFromDate").getDateValue();
			var sTo = this.byId("idExcelToDate").getDateValue();
			if (sFrom || sTo) {
				var oFrom = sFrom ? new Date(sFrom.getFullYear(), sFrom.getMonth(), sFrom.getDate()) : null;
				var oTo = sTo ? new Date(sTo.getFullYear(), sTo.getMonth(), sTo.getDate(), 23, 59, 59, 999) : null;
				var that = this;
				aFilters.push(new Filter({
					path: "GPDate",
					test: function (vDate) {
						if (!vDate) return false;
						var dVal;
						if (vDate instanceof Date) {
							dVal = vDate;
						} else if (typeof vDate === "string") {
							if (vDate.length === 8) {
								dVal = new Date(parseInt(vDate.substr(0, 4)), parseInt(vDate.substr(4, 2), 10) - 1, parseInt(vDate.substr(6, 2)));
							} else {
								dVal = new Date(vDate);
							}
						}
						if (!dVal || isNaN(dVal.getTime())) return false;
						var dOnly = new Date(dVal.getFullYear(), dVal.getMonth(), dVal.getDate());
						if (oFrom && dOnly < oFrom) return false;
						if (oTo && dOnly > oTo) return false;
						return true;
					}
				}));
			}

			if (aFilters.length > 0) {
				oBinding.filter(new Filter({ filters: aFilters, and: true }));
			} else {
				oBinding.filter([]);
			}
		},

		onDownloadExcel: function () {
			var that = this;
			var oTable = this.byId("ashReqListTable");
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
					"Request No": o.GatePassReqNo || "",
					"Gate Pass No": o.GatePassNo || "",
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
			var aParts = ["Ash_GP_Request"];
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
			var sReqNo = oContext.getProperty("GatePassReqNo") || "";

			this.getRouter().navTo("AshGatePassCreation", {
				reqNo: encodeURIComponent(sReqNo)
			});
		},

		onPrintList: function () {
			var oTable = this.byId("ashReqListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel().getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}
			var that = this;
			var sHtml = "<html><head><title>Ash Gate Pass Request List</title><style>";
			sHtml += "body { font-family: Arial, sans-serif; padding: 20px; }";
			sHtml += "h2 { text-align: center; color: #1F4E79; }";
			sHtml += "table { width: 100%; border-collapse: collapse; margin-top: 20px; }";
			sHtml += "th, td { border: 1px solid #BDC3C7; padding: 10px; text-align: left; font-size: 12px; }";
			sHtml += "th { background-color: #F2F4F4; color: #1F4E79; font-weight: bold; }";
			sHtml += "tr:nth-child(even) { background-color: #F8F9F9; }</style></head><body>";
			sHtml += "<h2>Ash Gate Pass Request List</h2><table><thead><tr>";
			sHtml += "<th>Request No</th><th>Gate Pass No</th><th>Sales Document</th><th>Customer Name</th><th>Vehicle No</th><th>GP Date</th><th>Approval</th>";
			sHtml += "</tr></thead><tbody>";
			aObjects.forEach(function (o) {
				var sApproval = o.Approval1 === "A1" ? "Approved" : o.Approval1 === "R" ? "Rejected" : "Pending";
				sHtml += "<tr>";
				sHtml += "<td>" + (o.GatePassReqNo || "") + "</td>";
				sHtml += "<td>" + (o.GatePassNo || "") + "</td>";
				sHtml += "<td>" + (o.SalesDocument || "") + "</td>";
				sHtml += "<td>" + (o.CustomerName || "") + "</td>";
				sHtml += "<td>" + (o.VehicleNo || "") + "</td>";
				sHtml += "<td>" + that.formatDate(o.GPDate) + "</td>";
				sHtml += "<td>" + sApproval + "</td>";
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
			var oTable = this.byId("ashReqListTable");
			var oBinding = oTable ? oTable.getBinding("items") : null;
			var aObjects = [];
			if (oBinding) {
				var aContexts = oBinding.getContexts(0, oBinding.getLength());
				aContexts.forEach(function (oContext) {
					if (oContext.getObject()) { aObjects.push(oContext.getObject()); }
				});
			} else {
				aObjects = this.getView().getModel().getProperty("/results") || [];
			}
			if (!aObjects.length) {
				sap.m.MessageToast.show("No items to copy.");
				return;
			}
			var that = this;
			var sHeaders = ["Request No", "Gate Pass No", "Sales Document", "Customer Name", "Vehicle No", "GP Date", "Approval"];
			var aLines = [sHeaders.join("\t")];
			aObjects.forEach(function (o) {
				var sApproval = o.Approval1 === "A1" ? "Approved" : o.Approval1 === "R" ? "Rejected" : "Pending";
				aLines.push([
					o.GatePassReqNo || "",
					o.GatePassNo || "",
					o.SalesDocument || "",
					o.CustomerName || "",
					o.VehicleNo || "",
					that.formatDate(o.GPDate),
					sApproval
				].join("\t"));
			});
			var sText = aLines.join("\n");
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(sText).then(function () {
					sap.m.MessageToast.show("List copied to clipboard.");
				});
			} else {
				var textArea = document.createElement("textarea");
				textArea.value = sText;
				document.body.appendChild(textArea);
				textArea.select();
				document.execCommand("copy");
				document.body.removeChild(textArea);
				sap.m.MessageToast.show("List copied to clipboard.");
			}
		},

		formatDate: function (vDate) {
			if (!vDate) return "";
			if (vDate instanceof Date) {
				return vDate.toLocaleDateString('en-GB');
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
