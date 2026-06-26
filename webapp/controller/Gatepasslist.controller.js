sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel",
	"zgpms/meilpower/com/utils/ExcelExport"
], function (BaseController, Filter, FilterOperator, JSONModel, ExcelExport) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.GatePassList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ items: [] }), "gatePassList");
			this.getRouter().getRoute("GatePassList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this._getData();
		},

		onSearchFieldLiveChange: function () {
			this._applyClientFilters();
		},

		onSelectFilterChange: function () {
			this._getData();
		},

		onResetButtonPress: function () {
			this.byId("idGatePassSearchField").setValue("");
			this.byId("idStatusFilterSelect").setSelectedKey("");
			this.byId("idTypeFilterSelect").setSelectedKey("");
			this._getData();
		},

		_getData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				return;
			}

			var sSelectedStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			var sBackendStatus = "All";
			if (sSelectedStatus && sSelectedStatus !== "Store Approval Pending") {
				sBackendStatus = sSelectedStatus;
			}
			var sType = this.byId("idTypeFilterSelect").getSelectedKey();

			var that = this;
			var aAllResults = [];
			var iDone = 0;
			
			var aTypesToQuery = sType ? [sType] : ["NRGP", "RGP", "PO"];
			var iTarget = aTypesToQuery.length;

			function onBothDone() {
				iDone++;
				if (iDone === iTarget) {
					sap.ui.core.BusyIndicator.hide();
					
					// Client-side sort by GatePassDate descending
					aAllResults.sort(function (a, b) {
						var dA = a.GatePassDate ? new Date(a.GatePassDate) : new Date(0);
						var dB = b.GatePassDate ? new Date(b.GatePassDate) : new Date(0);
						return dB - dA;
					});

					that.getView().getModel("gatePassList").setProperty("/items", aAllResults);
					
					// Apply search and status filters client-side on the updated list
					that._applyClientFilters();
				}
			}

			sap.ui.core.BusyIndicator.show(0);

			aTypesToQuery.forEach(function (typeKey) {
				var aFilters = [
					new Filter("GatePassType", FilterOperator.EQ, typeKey),
					new Filter("Status", FilterOperator.EQ, sBackendStatus)
				];

				oODataModel.read("/GateReqHdrSet", {
					filters: aFilters,
					urlParameters: { "$expand": "GateReqItmNav" },
					success: function (oData) {
						var aResults = oData.results || [];
						aResults = aResults.map(function (oItem) {
							var sReqNo = "";
							if (oItem.GatePassReqNo !== undefined && oItem.GatePassReqNo !== null) {
								sReqNo = String(oItem.GatePassReqNo).trim();
							} else if (oItem.GatePassreqNo !== undefined && oItem.GatePassreqNo !== null) {
								sReqNo = String(oItem.GatePassreqNo).trim();
							}
							return {
								GatePassReqNo: sReqNo,
								GatePassNo: oItem.GatePassNo ? String(oItem.GatePassNo).trim() : "",
								PurchaseOrder: sReqNo,
								GatePassType: typeKey === "PO" ? "GP with PO" : (oItem.GatePassType || typeKey),
								Status: that.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend),
								Plant: oItem.Plant ? String(oItem.Plant).trim() : "",
								VendorName: oItem.VendorName ? String(oItem.VendorName).trim() : "",
								Vendor: oItem.Vendor || "",
								VendorGST: oItem.VendorGST || "",
								City: oItem.City || "",
								ZipCode: oItem.ZipCode || "",
								Department: oItem.Department ? String(oItem.Department).trim() : "",
								VehicleNo: oItem.VehicleNo ? String(oItem.VehicleNo).trim() : "",
								ModeOfDispatch: oItem.ModeOfDispatch || "",
								LRNumber: oItem.LRNumber || oItem.LRNnumber || "",
								TransporterName: oItem.TransporterName || "",
								ChallanNumber: oItem.ChallanNumber || "",
								ChallanDate: oItem.ChallanDate || "",
								Remarks: oItem.Remarks || "",
								HODRemarks: oItem.HODRemarks || "",
								GatePassDate: oItem.GatePassDate || null,
								Approval1: oItem.Approval1 || "",
								Approval2: oItem.Approval2 || "",
								ApprovalReq: oItem.ApprovalReq || "",
								STORERemarks: oItem.STORERemarks || oItem.StoreRemarks || "",
								StoreAmmend: oItem.StoreAmmend || "",
								GateReqItmNav: oItem.GateReqItmNav || null
							};
						});
						aAllResults = aAllResults.concat(aResults);
						onBothDone();
					},
					error: function () {
						onBothDone();
					}
				});
			});
		},

		_applyClientFilters: function () {
			var oTable = this.byId("idItemsGatePassTable");
			var oBinding = oTable.getBinding("items");
			if (!oBinding) {
				return;
			}

			var aFilters = [];
			var sSearch = this.byId("idGatePassSearchField").getValue().trim();
			if (sSearch) {
				aFilters.push(new Filter({
					filters: [
						new Filter("GatePassReqNo", FilterOperator.Contains, sSearch),
						new Filter("VendorName", FilterOperator.Contains, sSearch),
						new Filter("Department", FilterOperator.Contains, sSearch),
						new Filter("Plant", FilterOperator.Contains, sSearch)
					],
					and: false
				}));
			}

			var sSelectedStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			if (sSelectedStatus) {
				var that = this;
				aFilters.push(new Filter({
					path: "",
					test: function (oRow) {
						if (!oRow) return false;
						var sDerived = that.formatStatus(
							oRow.Status,
							oRow.Approval1,
							oRow.Approval2,
							oRow.ApprovalReq,
							oRow.STORERemarks || oRow.StoreRemarks,
							oRow.StoreAmmend
						);
						return sDerived === sSelectedStatus;
					}
				}));
			}

			oBinding.filter(aFilters);
			this._updateCount();
		},

		_updateCount: function () {
			var oBinding = this.byId("idItemsGatePassTable").getBinding("items");
			if (oBinding) {
				this.byId("idItemCountText").setText(oBinding.getLength() + " Items");
			}
		},

		onApproveButtonPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			if (!oItem) { return; }

			// Derive computed values because detail view expects them
			var sDerivedStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);
			var oRowData = JSON.parse(JSON.stringify(oItem));
			oRowData.Status = sDerivedStatus;

			// Cache row for StoreRequestDetail
			var oTemp = this.getOwnerComponent().getModel("storeTemp");
			if (!oTemp) {
				oTemp = new sap.ui.model.json.JSONModel();
				this.getOwnerComponent().setModel(oTemp, "storeTemp");
			}
			oTemp.setData(oRowData);

			this.getRouter().navTo("StoreRequestDetail", {
				reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
				gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
			});
		},

		onObjectIdentifierReqNoTitlePress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			if (!oItem || oItem.GatePassType === "GP with PO") {
				return;
			}
			
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			var sRole = oUserModel ? oUserModel.getProperty("/Role") : "";
			var sStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);

			var bApproved  = sStatus === "Approved"  || sStatus === "APPROVED"  || sStatus === "A";
			var bAmendment = sStatus === "Amendment" || sStatus === "AMENDMENT" || sStatus === "AM";

			if (bAmendment) {
				sap.m.MessageBox.information("This request is pending amendment by the requester.");
			} else if (bIsStoreUser) {
				if (bApproved) {
					this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo, gpNo: oItem.GatePassNo || "-" });
				} else {
					var oRowData = JSON.parse(JSON.stringify(oItem));
					oRowData.Status = sStatus;
					var oTemp = this.getOwnerComponent().getModel("storeTemp");
					if (!oTemp) {
						oTemp = new sap.ui.model.json.JSONModel();
						this.getOwnerComponent().setModel(oTemp, "storeTemp");
					}
					oTemp.setData(oRowData);
					this.getRouter().navTo("StoreRequestDetail", {
						reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
						gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
					});
				}
			} else {
				sap.m.MessageBox.warning("Access to Out Gate Pass creation is only allowed for Approved requests under the Store User (ZC_MM_GATEPASS_STORE_FRONTVIEW) role.\n\nYour current Role: " + (sRole || "No Role Assigned"));
			}
		},

		onColumnListItemPress: function (oEvent) {
			var oItem = oEvent.getSource().getBindingContext("gatePassList").getObject();
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsStoreUser = oUserModel ? oUserModel.getProperty("/IsStoreUser") : false;
			var bIsHodUser   = oUserModel ? oUserModel.getProperty("/IsHodUser")   : false;
			var sRole   = oUserModel ? oUserModel.getProperty("/Role")   : "";
			var sStatus = this.formatStatus(oItem.Status, oItem.Approval1, oItem.Approval2, oItem.ApprovalReq, oItem.STORERemarks || oItem.StoreRemarks, oItem.StoreAmmend);

			var bApproved  = sStatus === "Approved"  || sStatus === "APPROVED"  || sStatus === "A";
			var bAmendment = sStatus === "Amendment" || sStatus === "AMENDMENT" || sStatus === "AM";

			// Amendment: only the requester (non-HOD, non-Store) can edit and resubmit
			if (bAmendment) {
				if (!bIsHodUser && !bIsStoreUser) {
					this.getRouter().navTo("GatePassAmendment", {
						type:   encodeURIComponent(oItem.GatePassType  || "NRGP"),
						reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
						status: encodeURIComponent(sStatus || "AM")
					});
				} else {
					sap.m.MessageBox.information("This request is pending amendment by the requester.");
				}
				return;
			}

			// For fully approved requests, any user clicking the row goes directly to generate gate pass
			if (bApproved) {
				this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo, gpNo: oItem.GatePassNo || "-" });
				return;
			}

			if (bIsHodUser) {
				var oRowData = JSON.parse(JSON.stringify(oItem));
				oRowData.Status = sStatus;
				// Cache the full row object so HODRequestDetail can display immediately
				var oTemp = this.getOwnerComponent().getModel("hodTemp");
				if (!oTemp) {
					oTemp = new sap.ui.model.json.JSONModel();
					this.getOwnerComponent().setModel(oTemp, "hodTemp");
				}
				oTemp.setData(oRowData);

				// HOD: navigate to read-only detail with Approve/Reject/Amendment actions
				this.getRouter().navTo("HODRequestDetail", {
					reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
					gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
				});
				return;
			}

			if (bIsStoreUser && !bApproved && !bAmendment) {
				var oRowData = JSON.parse(JSON.stringify(oItem));
				oRowData.Status = sStatus;
				var oTemp = this.getOwnerComponent().getModel("storeTemp");
				if (!oTemp) {
					oTemp = new sap.ui.model.json.JSONModel();
					this.getOwnerComponent().setModel(oTemp, "storeTemp");
				}
				oTemp.setData(oRowData);
				this.getRouter().navTo("StoreRequestDetail", {
					reqNo:  encodeURIComponent(oItem.GatePassReqNo || ""),
					gpType: encodeURIComponent(oItem.GatePassType  || "NRGP")
				});
				return;
			}

			// Non-HOD legacy behaviour
			if (oItem.GatePassType === "GP with PO") {
				sap.m.MessageBox.information(
					"Gate Pass No: " + oItem.GatePassNo + "\n" +
					"Purchase Order: " + oItem.PurchaseOrder + "\n" +
					"Type: Gate Pass with PO\n" +
					"Status: " + sStatus + "\n" +
					"Plant: " + oItem.Plant + "\n" +
					"Vendor: " + oItem.VendorName + "\n" +
					"Department: " + oItem.Department + "\n" +
					"DC/Invoice Number: " + (oItem.VehicleNo || "N/A") + "\n\n" +
					"Note: This Gate Pass was created directly from Purchase Order details and is finalized on creation.",
					{ title: "PO Gate Pass Details" }
				);
				return;
			}
			this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo });
		},

		formatStatus: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			return this._deriveStatus({
				Status: sStatus,
				Approval1: sApproval1,
				Approval2: sApproval2,
				ApprovalReq: sApprovalReq,
				STORERemarks: sStoreRemarks,
				StoreAmmend: sStoreAmmend
			});
		},

		formatStatusState: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			var sDerived = this.formatStatus(sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend);
			if (sDerived === "Approved" || sDerived === "Closed" || sDerived === "CLOSED") {
				return "Success";
			}
			if (sDerived === "Rejected" || sDerived === "Cancelled" || sDerived === "REJECTED" || sDerived === "CANCELLED") {
				return "Error";
			}
			return "Warning";
		},

		onDownloadExcelButtonPress: function () {
			var aObjects = this.getView().getModel("gatePassList").getProperty("/items") || [];
			var dFrom = this.byId("idExcelFromDate").getDateValue();
			var dTo = this.byId("idExcelToDate").getDateValue();
			aObjects = ExcelExport.filterByDate(aObjects, "GatePassDate", dFrom, dTo);
			if (!aObjects.length) {
				sap.m.MessageToast.show("No data to export.");
				return;
			}
			var aRows = [];
			aObjects.forEach(function (o) {
				var sDate = "";
				if (o.GatePassDate) {
					var d = new Date(o.GatePassDate);
					sDate = d.getDate().toString().padStart(2, "0") + "-" +
						(d.getMonth() + 1).toString().padStart(2, "0") + "-" +
						d.getFullYear();
				}
				var oHeader = {
					"Request No": o.GatePassReqNo || "",
					"Gate Pass No": o.GatePassNo || "",
					"Type": o.GatePassType || "",
					"Date": sDate,
					"Status": o.Status || "",
					"Plant": o.Plant || "",
					"Vendor Code": o.Vendor || "",
					"Vendor Name": o.VendorName || "",
					"Vendor GST": o.VendorGST || "",
					"City": o.City || "",
					"Zip Code": o.ZipCode || "",
					"Department": o.Department || "",
					"Vehicle No": o.VehicleNo || "",
					"Mode of Dispatch": o.ModeOfDispatch || "",
					"LR Number": o.LRNumber || "",
					"Transporter": o.TransporterName || "",
					"Challan No": o.ChallanNumber || "",
					"Challan Date": o.ChallanDate || "",
					"Remarks": o.Remarks || "",
					"HOD Remarks": o.HODRemarks || "",
					"Store Remarks": o.STORERemarks || "",
					"Store Amend": o.StoreAmmend || ""
				};
				var aItems = (o.GateReqItmNav && o.GateReqItmNav.results) || (Array.isArray(o.GateReqItmNav) ? o.GateReqItmNav : []);
				if (aItems.length > 0) {
					aItems.forEach(function (itm) {
						var oRow = Object.assign({}, oHeader);
						oRow["Item No"] = itm.ItemNo || "";
						oRow["Material"] = itm.Material || "";
						oRow["Material Desc"] = itm.MaterialDesc || itm.Description || "";
						oRow["HSN Code"] = itm.HSNCode || "";
						oRow["Quantity"] = itm.Quantity || "";
						oRow["Item UOM"] = itm.UOM || "";
						aRows.push(oRow);
					});
				} else {
					oHeader["Item No"] = "";
					oHeader["Material"] = "";
					oHeader["Material Desc"] = "";
					oHeader["HSN Code"] = "";
					oHeader["Quantity"] = "";
					oHeader["Item UOM"] = "";
					aRows.push(oHeader);
				}
			});
			var sType = this.byId("idTypeFilterSelect").getSelectedKey();
			var sStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			var aParts = ["Gate_Pass"];
			if (sType) { aParts.push(sType.replace(/\s+/g, "_")); }
			if (sStatus) { aParts.push(sStatus.replace(/\s+/g, "_")); }
			if (dFrom) { aParts.push(ExcelExport.fmtDate(dFrom)); }
			if (dTo) { aParts.push("to_" + ExcelExport.fmtDate(dTo)); }
			var sFileName = aParts.join("_") + ".xlsx";
			var sSheetName = aParts.join(" ");
			ExcelExport.download(aRows, sSheetName, sFileName, 22);
		},

		showApproveBtn: function (sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend) {
			var sDerived = this.formatStatus(sStatus, sApproval1, sApproval2, sApprovalReq, sStoreRemarks, sStoreAmmend);
			var oUserModel = sap.ui.getCore().getModel("user");
			var bIsGatepassUserOnly = oUserModel ? oUserModel.getProperty("/IsGatepassUserOnly") : false;
			var bIsHodUser = oUserModel ? oUserModel.getProperty("/IsHodUser") : false;
			return (sDerived === "Store Approval Pending") && !bIsGatepassUserOnly && !bIsHodUser;
		}

	});
});
