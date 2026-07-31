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
				return;
			}
			var that = this;

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.read("/AshHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "ASHItmNav" },
				success: function (oData) {
					sap.ui.core.BusyIndicator.hide();
					// Only show rows where a gate pass number exists
					var aPasses = (oData.results || []).filter(function (r) {
						return (r.GatePassNo || "").trim() !== "";
					});
					that.getView().setModel(new JSONModel({ results: aPasses }), "ashList");
					that._applyFilters();
				},
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					that.getView().setModel(new JSONModel({ results: [] }), "ashList");
					
					var sMsg = "Failed to load Ash Gate Passes. Please try again.";
					try {
						var oErr = JSON.parse(oError.responseText);
						if (oErr && oErr.error && oErr.error.message) {
							sMsg = oErr.error.message.value;
						}
					} catch (e) { }
					sap.m.MessageBox.error(sMsg);
				}
			});
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

			// 1. Text Search Filter
			var oSearchField = this.byId("ashListTable").getHeaderToolbar().getContent().find(function(c) {
				return c.getMetadata().getName() === "sap.m.SearchField";
			});
			var sSearch = oSearchField ? oSearchField.getValue().trim() : "";

			if (sSearch) {
				var sLow = sSearch.toLowerCase();
				aFilters.push(new Filter({
					path: "",
					test: function(oValue, oContext) {
						var o = oContext ? oContext.getObject() : oValue;
						if (!o) return false;
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
						aObjects.push(Object.assign({}, oContext.getObject()));
					}
				});
			} else {
				var aRaw = this.getView().getModel("ashList").getProperty("/results") || [];
				aObjects = aRaw.map(function (o) { return Object.assign({}, o); });
			}

			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GPDate", dFrom, dTo);

			if (!aObjects.length) {
				sap.m.MessageToast.show("No record found");
				return;
			}

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				sap.m.MessageBox.error("OData model not found.");
				return;
			}

			sap.ui.core.BusyIndicator.show(0);

			// Read all items from /ASHItmSet in one call to make sure we capture bulk/older items
			oODataModel.read("/ASHItmSet", {
				success: function (oItmData) {
					sap.ui.core.BusyIndicator.hide();
					var aAllItems = oItmData.results || [];

					// Map all items by GatePassNo
					var oItemsMap = {};
					aAllItems.forEach(function (itm) {
						var sGPNo = (itm.GatePassNo || "").trim();
						if (sGPNo) {
							if (!oItemsMap[sGPNo]) {
								oItemsMap[sGPNo] = [];
							}
							oItemsMap[sGPNo].push(itm);
						}
					});

					// Build excel rows
					var aRows = [];
					var iSno = 1;
					aObjects.forEach(function (o) {
						var sApproval = o.Approval1 === "A" ? "CLOSED" : (o.Approval1 === "R" ? "REJECTED" : "OPEN");
						
						// Get items either from expanded navigation or from our loaded all-items list
						var sGPNo = (o.GatePassNo || "").trim();
						var aItems = (o.ASHItmNav && (o.ASHItmNav.results || o.ASHItmNav)) || [];
						if (!Array.isArray(aItems)) { aItems = []; }
						if (aItems.length === 0 && sGPNo && oItemsMap[sGPNo]) {
							aItems = oItemsMap[sGPNo];
						}

						if (aItems.length === 0) {
							aRows.push({
								"Sno": iSno++,
								"Issue Date": that.formatDate(o.GPDate) || "",
								"Ash Gate Pass Number": o.GatePassNo || "",
								"Vendor Name": o.CustomerName || "",
								"Item Description": o.MaterialDescription || o.MaterialDesc || o.Description || o.ItemDescription || o.CommonDesc || "",
								"Qty Send": o.Quantity || "",
								"Uom": o.UOM || o.uom || o.Uom || "",
								"HSN Code": o.HSNCode || o.HsnCode || "",
								"UOP": o.ItemNetPrice || o.UnitPrice || "",
								"Line Cost Value": o.Totalvalue || o.TotalValue || o.LineCost || o.ItemNetPrice || "",
								"Total Value": o.TotalValue || o.Totalvalue || o.FinalTotal || o.finalTotal || "",
								"Gate Pass Remarks": o.Remarks || o.GatePassRemarks || o.UserRemarks || o.StoreRemarks || "",
								"DC No": o.DCNumber || o.DcNumber || o.DCNo || o.DcNo || "",
								"DC Notes": o.DCNotes || o.DcNotes || o.Remarks || "",
								"Vehicle No": o.VehicleNo || o.VehNo || "",
								"Transport Name": o.TransporterName || o.TransportName || "",
								"Transporter GST": o.TransporterGst || o.TransporterGST || o.TransGST || "",
								"Request User Name": o.RequestedUser || o.ReqEmpName || o.UserName || o.User || "",
								"Approver Name": o.ApproverName || o.HODEmpName || o.Approver || "",
								"Department": o.Department || o.Dept || o.DeptCode || "",
								"Status": sApproval
							});
						} else {
							aItems.forEach(function (itm) {
								aRows.push({
									"Sno": iSno++,
									"Issue Date": that.formatDate(o.GPDate) || "",
									"Ash Gate Pass Number": o.GatePassNo || "",
									"Vendor Name": o.CustomerName || "",
									"Item Description": itm.MaterialDescription || itm.MaterialDesc || itm.Description || itm.ItemDescription || o.ItemDescription || o.CommonDesc || "",
									"Qty Send": itm.SentQuantity || itm.Quantity || o.Quantity || "",
									"Uom": itm.UOM || itm.uom || itm.Uom || o.UOM || o.uom || o.Uom || "",
									"HSN Code": itm.HSNCode || itm.HsnCode || o.HSNCode || o.HsnCode || "",
									"UOP": itm.ItemNetPrice || itm.UnitPrice || o.ItemNetPrice || o.UnitPrice || "",
									"Line Cost Value": itm.Totalvalue || itm.TotalValue || itm.LineCost || itm.ItemNetPrice || o.LineCost || o.ItemNetPrice || "",
									"Total Value": o.TotalValue || o.Totalvalue || o.FinalTotal || o.finalTotal || "",
									"Gate Pass Remarks": o.Remarks || o.GatePassRemarks || o.UserRemarks || o.StoreRemarks || "",
									"DC No": o.DCNumber || o.DcNumber || o.DCNo || o.DcNo || "",
									"DC Notes": o.DCNotes || o.DcNotes || o.Remarks || "",
									"Vehicle No": o.VehicleNo || o.VehNo || "",
									"Transport Name": o.TransporterName || o.TransportName || "",
									"Transporter GST": o.TransporterGst || o.TransporterGST || o.TransGST || "",
									"Request User Name": o.RequestedUser || o.ReqEmpName || o.UserName || o.User || "",
									"Approver Name": o.ApproverName || o.HODEmpName || o.Approver || "",
									"Department": o.Department || o.Dept || o.DeptCode || "",
									"Status": sApproval
								});
							});
						}
					});

					var aParts = ["Ash_Gate_Pass"];
					if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
					if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
					ExcelExport.download(aRows, aParts.join(" "), aParts.join("_") + ".xlsx", 21);
				},
				error: function (oErr) {
					sap.ui.core.BusyIndicator.hide();
					sap.m.MessageBox.error("Failed to read item details for Excel export.");
				}
			});
		},

		onRowPress: function (oEvent) {
			var oItem = oEvent.getSource();
			if (oItem.getMetadata().getName() === "sap.m.Button") {
				oItem = oItem.getParent();
			}
			var oContext = oItem.getBindingContext("ashList");
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
		},

		onSort: function () {
			this._openSortDialog("ashListTable", [
				{ key: "GatePassNo", text: "Gate Pass No" },
				{ key: "SalesDocument", text: "Sales Document" },
				{ key: "CustomerName", text: "Customer Name" },
				{ key: "VehicleNo", text: "Vehicle No" },
				{ key: "GPDate", text: "GP Date", selected: true }
			]);
		}

	});
});
