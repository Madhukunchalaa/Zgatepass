sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, Filter, FilterOperator, JSONModel, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.NRGPList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ items: [] }), "nrgpList");
			this.getRouter().getRoute("NRGPList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			var oUserModel = sap.ui.getCore().getModel("user");
			if (oUserModel && oUserModel.getProperty("/IsGatepassUserOnly")) {
				sap.m.MessageBox.error("You do not have authorization to access the Gate Pass List screen.");
				this.getRouter().navTo("home");
				return;
			}
			this.getView().getModel("nrgpList").setProperty("/items", []);
			this._loadData();
		},

		_loadData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) return;

			var that = this;
			var aAllResults = [];
			var iDone = 0;
			var iTarget = 3;

			function onBothDone() {
				iDone++;
				if (iDone === iTarget) {
					sap.ui.core.BusyIndicator.hide();
					that.getView().getModel("nrgpList").setProperty("/items", aAllResults);
					that._updateCount();
				}
			}

			function mapItems(oData) {
				return (oData.results || []).map(function (oItem) {
					var sRawStatus = oItem.GPStatus || "";
					var sDisplayStatus = sRawStatus;
					if (oItem.GatePassType === "RGP" && sRawStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT") {
						sDisplayStatus = "Awaiting for Return";
					}
					return {
						GatePassNo: oItem.GatePassNo,
						GatePassreqNo: oItem.GatePassReqNo || oItem.GatePassreqNo || "",
						GatePassDate: that._formatDate(oItem.GatePassDate),
						GatePassType: oItem.GatePassType,
						Plant: oItem.Plant,
						Department: oItem.Department,
						VendorGST: oItem.VendorGST,
						City: oItem.City,
						VehicleNo: oItem.VehicleNo,
						GPStatus: sRawStatus,
						GPStatusText: sDisplayStatus,
						StatusState: that._getStatusState(sRawStatus),
						NoOfItems: (oItem.OutgateNav && oItem.OutgateNav.results) ? oItem.OutgateNav.results.length : 0,
						OutgateNav: oItem.OutgateNav || null,
						VendorName: oItem.VendorName || "",
						Vendor: oItem.Vendor || "",
						ZipCode: oItem.ZipCode || "",
						LRNumber: oItem.LRNumber || "",
						ModeOfDispatch: oItem.ModeOfDispatch || "",
						TransporterName: oItem.TransporterName || "",
						TransporterGST: oItem.TransporterGST || "",
						ChallanNumber: oItem.ChallanNumber || "",
						ChallanDate: oItem.ChallanDate || "",
						// PurchasingDoc: oItem.PurchasingDoc || "",
						CommonDesc: oItem.CommonDesc || "",
						NoOfPacakages: oItem.NoOfPacakages || "",
						Remarks: oItem.Remarks || "",
						InsuranceReq: oItem.InsuranceReq || "",
						InsuranceDate: oItem.InsuranceDate || "",
						InsuranceAmount: oItem.InsuranceAmount || "",
						FiscalYear: oItem.FiscalYear || ""
					};
				});
			}

			sap.ui.core.BusyIndicator.show(0);

			// 1. Fetch NRGP Out Gate Passes
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					aAllResults = aAllResults.concat(mapItems(oData));
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			// 2. Fetch RGP Out Gate Passes
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					aAllResults = aAllResults.concat(mapItems(oData));
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			// 3. Fetch PO Gate Passes from OutGatePassSet (filtered by GatePassType eq 'PO')
			oODataModel.read("/OutGatePassSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "PO")],
				urlParameters: { "$expand": "OutgateNav" },
				success: function (oData) {
					var aPoResults = (oData.results || []).map(function (oItem) {
						return {
							GatePassNo: oItem.GatePassNo || "",
							GatePassreqNo: "", // No request number for PO gate passes
							PurchaseOrder: oItem.GatePassReqNo || oItem.GatePassreqNo || "", // Store the PO number for the detail dialog
							GatePassDate: that._formatDate(oItem.GatePassDate),
							GatePassType: "PO",
							Plant: oItem.Plant || "",
							Department: oItem.Department || "",
							VendorGST: oItem.VendorGST || "", // Vendor Code / GST
							City: oItem.City || "",
							VehicleNo: oItem.VehicleNo || "",
							GPStatus: oItem.GPStatus || "Pending",
							StatusState: that._getStatusState(oItem.GPStatus || "Pending"),
							NoOfItems: (oItem.OutgateNav && oItem.OutgateNav.results) ? oItem.OutgateNav.results.length : 0,
							OutgateNav: oItem.OutgateNav || null,
							VendorName: oItem.VendorName || "",
							Vendor: oItem.Vendor || "",
							ZipCode: oItem.ZipCode || "",
							LRNumber: oItem.LRNumber || "",
							ModeOfDispatch: oItem.ModeOfDispatch || "",
							TransporterName: oItem.TransporterName || "",
							TransporterGST: oItem.TransporterGST || "",
							ChallanNumber: oItem.ChallanNumber || "",
							ChallanDate: oItem.ChallanDate || "",
							// PurchasingDoc: oItem.PurchasingDoc || "",
							CommonDesc: oItem.CommonDesc || "",
							NoOfPacakages: oItem.NoOfPacakages || "",
							Remarks: oItem.Remarks || "",
							InsuranceReq: oItem.InsuranceReq || "",
							InsuranceDate: oItem.InsuranceDate || "",
							InsuranceAmount: oItem.InsuranceAmount || "",
							FiscalYear: oItem.FiscalYear || ""
						};
					});
					aAllResults = aAllResults.concat(aPoResults);
					onBothDone();
				},
				error: function () { onBothDone(); }
			});
		},


		_getStatusState: function (sStatus) {
			if (sStatus === "CLOSED" || sStatus === "Approved" || sStatus === "APPROVED" || sStatus === "A") return "Success";
			if (sStatus === "AWAITING FOR VENDOR ACKNOWLEDGEMENT" || sStatus === "Pending" || sStatus === "PENDING") return "Warning";
			if (sStatus === "OPEN") return "Information";
			if (sStatus === "Rejected" || sStatus === "REJECTED" || sStatus === "R" || sStatus === "CANCELLED" || sStatus === "Cancelled") return "Error";
			if (sStatus === "AM" || sStatus === "AMENDMENT") return "Error";
			return "None";
		},

		onSearchFieldLiveChange: function () {
			this._applyFilters();
		},

		onSelectFilterChange: function () {
			this._applyFilters();
		},

		onDatePickerChange: function () {
			this._applyFilters();
		},

		onResetButtonPress: function () {
			this.byId("idNRGPSearchField").setValue("");
			this.byId("idNRGPTypeSelect").setSelectedKey("");
			this.byId("idNRGPStatusSelect").setSelectedKey("");
			this.byId("idNRGPFromDatePicker").setValue("");
			this.byId("idNRGPToDatePicker").setValue("");
			this._applyFilters();
		},

		_applyFilters: function () {
			var oBinding = this.byId("idItemsNRGPTable").getBinding("items");
			var aFilters = [];

			var sSearch = this.byId("idNRGPSearchField").getValue().trim();
			if (sSearch) {
				aFilters.push(new Filter({
					filters: [
						new Filter("GatePassNo", FilterOperator.Contains, sSearch),
						new Filter("GatePassreqNo", FilterOperator.Contains, sSearch),
						new Filter("Department", FilterOperator.Contains, sSearch)
					],
					and: false
				}));
			}

			var sType = this.byId("idNRGPTypeSelect").getSelectedKey();
			if (sType) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, sType));
			}

			var sStatus = this.byId("idNRGPStatusSelect").getSelectedKey();
			if (sStatus) {
				aFilters.push(new Filter("GPStatus", FilterOperator.EQ, sStatus));
			}

			var oFromDate = this.byId("idNRGPFromDatePicker").getDateValue();
			var oToDate = this.byId("idNRGPToDatePicker").getDateValue();
			if (oFromDate || oToDate) {
				aFilters.push(new Filter({
					path: "GatePassDate",
					test: function (sDate) {
						if (!sDate) { return false; }
						var aParts = sDate.split("-");
						if (aParts.length !== 3) { return false; }
						var oItemDate = new Date(parseInt(aParts[2]), parseInt(aParts[1]) - 1, parseInt(aParts[0]));
						if (oFromDate) {
							var oFrom = new Date(oFromDate); oFrom.setHours(0, 0, 0, 0);
							if (oItemDate < oFrom) { return false; }
						}
						if (oToDate) {
							var oTo = new Date(oToDate); oTo.setHours(23, 59, 59, 999);
							if (oItemDate > oTo) { return false; }
						}
						return true;
					}
				}));
			}

			oBinding.filter(aFilters);
			this._updateCount();
		},

		_updateCount: function () {
			var oBinding = this.byId("idItemsNRGPTable").getBinding("items");
			if (oBinding) {
				this.byId("idNRGPCountText").setText(oBinding.getLength() + " Items");
			}
		},

		onDownloadExcel: function () {
			var aObjects = this.getView().getModel("nrgpList").getProperty("/items") || [];
			var dFrom = this.byId("idNRGPFromDatePicker").getDateValue();
			var dTo = this.byId("idNRGPToDatePicker").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GatePassDate", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = [];
			aObjects.forEach(function (o) {
				var oHeader = {
					"GP No": o.GatePassNo || "",
					"Req No": o.GatePassreqNo || "",
					"Type": o.GatePassType || "",
					"Date": o.GatePassDate || "",
					"Plant": o.Plant || "",
					"Department": o.Department || "",
					"Vendor GST": o.VendorGST || "",
					"Vehicle No": o.VehicleNo || "",
					"Items": o.NoOfItems || 0,
					"Status": o.GPStatusText || o.GPStatus || "",
					"Vendor Name": o.VendorName || "",
					"Vendor Code": o.Vendor || "",
					"City": o.City || "",
					"Zip Code": o.ZipCode || "",
					"LR Number": o.LRNumber || "",
					"Mode of Dispatch": o.ModeOfDispatch || "",
					"Transporter": o.TransporterName || "",
					"Transporter GST": o.TransporterGST || "",
					"Challan No": o.ChallanNumber || "",
					"Challan Date": o.ChallanDate || "",
					"Purchasing Doc": o.PurchasingDoc || "",
					"Description": o.CommonDesc || "",
					"No of Packages": o.NoOfPacakages || "",
					"Remarks": o.Remarks || "",
					"Insurance Required": o.InsuranceReq || "",
					"Insurance Date": o.InsuranceDate || "",
					"Insurance Amount": o.InsuranceAmount || "",
					"Fiscal Year": o.FiscalYear || ""
				};
				var aItems = (o.OutgateNav && o.OutgateNav.results) || (Array.isArray(o.OutgateNav) ? o.OutgateNav : []);
				if (aItems.length > 0) {
					aItems.forEach(function (itm) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item No"] = itm.ItemNo || "";
						oRow["Material"] = itm.Material || "";
						oRow["Material Desc"] = itm.MaterialDesc || itm.Description || "";
						oRow["HSN Code"] = itm.HSNCode || "";
						oRow["Sent Qty"] = itm.SentQuantity || itm.Quantity || "";
						oRow["Received Qty"] = itm.RecievedQuantity || "";
						oRow["Balance Qty"] = itm.BalanceQuantity || "";
						oRow["Item UOM"] = itm.UOM || "";
						oRow["Item Net Price"] = itm.ItemNetPrice || "";
						oRow["Total Value"] = itm.Totalvalue || "";
						aRows.push(oRow);
					});
				} else {
					oHeader["Item No"] = "";
					oHeader["Material"] = "";
					oHeader["Material Desc"] = "";
					oHeader["HSN Code"] = "";
					oHeader["Sent Qty"] = "";
					oHeader["Received Qty"] = "";
					oHeader["Balance Qty"] = "";
					oHeader["Item UOM"] = "";
					oHeader["Item Net Price"] = "";
					oHeader["Total Value"] = "";
					aRows.push(oHeader);
				}
			});
			var sType = this.byId("idNRGPTypeSelect").getSelectedKey();
			var sStatus = this.byId("idNRGPStatusSelect").getSelectedKey();
			var aParts = ["Out_Gate_Pass"];
			if (sType) { aParts.push(sType.replace(/\s+/g, "_")); }
			if (sStatus) { aParts.push(sStatus.replace(/\s+/g, "_")); }
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			var sFileName = aParts.join("_") + ".xlsx";
			var sSheetName = aParts.join(" ");
			ExcelExport.download(aRows, sSheetName, sFileName, 28);
		},

		onColumnListItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("nrgpList").getObject();
			if (oItem.GatePassType === "PO") {
				sap.m.MessageBox.information(
					"Gate Pass No: " + oItem.GatePassNo + "\n" +
					"Purchase Order: " + oItem.PurchaseOrder + "\n" +
					"Type: Gate Pass with PO\n" +
					"Status: " + oItem.GPStatus + "\n" +
					"Plant: " + oItem.Plant + "\n" +
					"Department: " + oItem.Department + "\n" +
					"DC/Invoice Number: " + (oItem.VehicleNo || "N/A") + "\n\n" +
					"Note: This Gate Pass was created directly from Purchase Order details and is finalized on creation.",
					{ title: "PO Gate Pass Details" }
				);
				return;
			}
			if (oItem.GatePassType === "RGP") {
				sap.ui.getCore().setModel(new sap.ui.model.json.JSONModel(oItem), "selectedRGP");
				this.getRouter().navTo("RGPDetail", { gpNo: oItem.GatePassNo });
			} else {
				this.getRouter().navTo("NRGPDetail", { gpNo: oItem.GatePassNo, gpType: oItem.GatePassType });
			}
		}

	});
});
