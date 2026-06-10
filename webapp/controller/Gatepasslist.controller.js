sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/json/JSONModel"
], function (BaseController, Filter, FilterOperator, JSONModel) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.GatePassList", {

		onInit: function () {
			this.getView().setModel(new JSONModel({ items: [] }), "gatePassList");
			this.getRouter().getRoute("GatePassList").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			this.getView().getModel("gatePassList").setProperty("/items", []);
			this._getData();
		},

		_getData: function () {
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				return;
			}

			var that = this;
			var aAllResults = [];
			var iDone = 0;
			var iTarget = 3;

			function onBothDone() {
				iDone++;
				if (iDone === iTarget) {
					sap.ui.core.BusyIndicator.hide();
					aAllResults.forEach(function (oItem) {
						oItem.PendingAt = that._computePendingAt(oItem);
					});
					that.getView().getModel("gatePassList").setProperty("/items", aAllResults);
					that._updateCount();
				}
			}

			sap.ui.core.BusyIndicator.show(0);

			// 1. Fetch NRGP requests
			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "NRGP"), new Filter("Status", FilterOperator.EQ, "All")],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					var aMapped = (oData.results || []).map(function (oItem) {
						oItem.Status = that._deriveStatus(oItem);
						return oItem;
					});
					aAllResults = aAllResults.concat(aMapped);
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			// 2. Fetch RGP requests
			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "RGP"), new Filter("Status", FilterOperator.EQ, "All")],
				urlParameters: { "$expand": "GateReqItmNav" },
				success: function (oData) {
					var aMapped = (oData.results || []).map(function (oItem) {
						oItem.Status = that._deriveStatus(oItem);
						return oItem;
					});
					aAllResults = aAllResults.concat(aMapped);
					onBothDone();
				},
				error: function () { onBothDone(); }
			});

			// 3. Fetch PO Gate Passes from GateInPoHdrSet (filtered by logged-in user's plant)
			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = oUserModel ? oUserModel.getProperty("/Plant") : "";
			var aPoFilters = [];
			if (sPlant) {
				aPoFilters.push(new Filter("Plant", FilterOperator.EQ, sPlant));
			}

			// 3. Fetch PO Gate Passes from GateReqHdrSet (filtered by GatePassType eq 'PO')
			oODataModel.read("/GateReqHdrSet", {
				filters: [new Filter("GatePassType", FilterOperator.EQ, "PO"), new Filter("Status", FilterOperator.EQ, "All")],
				success: function (oData) {
					var aPoResults = (oData.results || []).map(function (oItem) {
						return {
							GatePassReqNo: "", // No request number for PO gate passes
							GatePassNo: oItem.GatePassNo || "",
							PurchaseOrder: oItem.GatePassReqNo || oItem.GatePassreqNo || "", // Store PO for dialog details
							GatePassType: "GP with PO",
							Status: oItem.Status || "Pending",
							Plant: oItem.Plant || "",
							VendorName: oItem.VendorName || "",
							Department: oItem.Department || "",
							VehicleNo: oItem.VehicleNo || "",
							PendingAt: ""
						};
					});
					aAllResults = aAllResults.concat(aPoResults);
					onBothDone();
				},
				error: function () { onBothDone(); }
			});
		},

		onSearchFieldLiveChange: function () {
			this._applyFilters();
		},

		onSelectFilterChange: function () {
			this._applyFilters();
		},

		onResetButtonPress: function () {
			this.byId("idGatePassSearchField").setValue("");
			this.byId("idStatusFilterSelect").setSelectedKey("");
			this.byId("idTypeFilterSelect").setSelectedKey("");
			this._applyFilters();
		},

		_applyFilters: function () {
			var oBinding = this.byId("idItemsGatePassTable").getBinding("items");
			var aFilters = [];

			var sSearch = this.byId("idGatePassSearchField").getValue().trim();
			if (sSearch) {
				aFilters.push(new Filter("GatePassReqNo", FilterOperator.Contains, sSearch));
			}

			var sStatus = this.byId("idStatusFilterSelect").getSelectedKey();
			if (sStatus) {
				aFilters.push(new Filter("Status", FilterOperator.EQ, sStatus));
			}

			var sType = this.byId("idTypeFilterSelect").getSelectedKey();
			if (sType) {
				aFilters.push(new Filter("GatePassType", FilterOperator.EQ, sType));
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

			// Cache row for StoreRequestDetail
			var oTemp = this.getOwnerComponent().getModel("storeTemp");
			if (!oTemp) {
				oTemp = new sap.ui.model.json.JSONModel();
				this.getOwnerComponent().setModel(oTemp, "storeTemp");
			}
			oTemp.setData(JSON.parse(JSON.stringify(oItem)));

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
			var sStatus = oItem.Status || "";

			var bApproved  = sStatus === "Approved"  || sStatus === "APPROVED"  || sStatus === "A";
			var bAmendment = sStatus === "Amendment" || sStatus === "AMENDMENT" || sStatus === "AM";

			if (bAmendment) {
				// Route back to GatePassCreation in amendment mode so user can edit and resubmit
				this.getRouter().navTo("GatePassAmendment", {
					type:  encodeURIComponent(oItem.GatePassType  || "NRGP"),
					reqNo: encodeURIComponent(oItem.GatePassReqNo || "")
				});
			} else if (bIsStoreUser) {
				if (bApproved) {
					this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo, gpNo: oItem.GatePassNo || "-" });
				} else {
					var oTemp = this.getOwnerComponent().getModel("storeTemp");
					if (!oTemp) {
						oTemp = new sap.ui.model.json.JSONModel();
						this.getOwnerComponent().setModel(oTemp, "storeTemp");
					}
					oTemp.setData(JSON.parse(JSON.stringify(oItem)));
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
			var sStatus = oItem.Status || "";

			var bApproved  = sStatus === "Approved"  || sStatus === "APPROVED"  || sStatus === "A";
			var bAmendment = sStatus === "Amendment" || sStatus === "AMENDMENT" || sStatus === "AM";

			// Amendment: route requester (non-HOD, non-Store) back to creation form to edit and resubmit
			if (bAmendment && !bIsHodUser) {
				this.getRouter().navTo("GatePassAmendment", {
					type:  encodeURIComponent(oItem.GatePassType  || "NRGP"),
					reqNo: encodeURIComponent(oItem.GatePassReqNo || "")
				});
				return;
			}

			// For fully approved requests, any user clicking the row goes directly to generate gate pass
			if (bApproved) {
				this.getRouter().navTo("OutGatePass", { reqNo: oItem.GatePassReqNo, gpNo: oItem.GatePassNo || "-" });
				return;
			}

			if (bIsHodUser) {
				// Cache the full row object so HODRequestDetail can display immediately
				var oTemp = this.getOwnerComponent().getModel("hodTemp");
				if (!oTemp) {
					oTemp = new sap.ui.model.json.JSONModel();
					this.getOwnerComponent().setModel(oTemp, "hodTemp");
				}
				oTemp.setData(JSON.parse(JSON.stringify(oItem)));

				// HOD: navigate to read-only detail with Approve/Reject/Amendment actions
				this.getRouter().navTo("HODRequestDetail", {
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
					"Status: " + oItem.Status + "\n" +
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

		_deriveStatus: function (oItem) {
			var s1 = oItem.Approval1;
			if (!s1 || s1 === "null" || s1 === "undefined") s1 = "";
			s1 = String(s1).trim().toUpperCase();

			var s2 = oItem.Approval2;
			if (!s2 || s2 === "null" || s2 === "undefined") s2 = "";
			s2 = String(s2).trim().toUpperCase();

			var sStatus = oItem.Status;
			if (!sStatus || sStatus === "null" || sStatus === "undefined") sStatus = "";
			sStatus = String(sStatus).trim().toUpperCase();

			// 1. Primary logic based on Approval fields
			if (s1 === "R"  || s2 === "R")  return "Rejected";
			if (s1 === "AM" || s2 === "AM") return "Amendment";
			if (s2) return "Approved"; // If Store approved, it is fully approved
			
			// If backend GET_ENTITYSET forgot Approval2 but returned STORERemarks, we can assume Store acted
			var sStoreRemarks = oItem.STORERemarks;
			if (sStoreRemarks && String(sStoreRemarks).trim() !== "" && String(sStoreRemarks) !== "null") {
				return "Approved";
			}

			if (s1 && !s2) return "Store Approval Pending";
			
			// 2. Fallback to Status field if backend list doesn't return Approval1/Approval2
			if (sStatus === "STORE APPROVAL PENDING") return "Store Approval Pending";
			if (sStatus === "APPROVED") return "Approved";
			if (sStatus === "REJECTED") return "Rejected";
			if (sStatus === "AMENDMENT") return "Amendment";
			if (sStatus === "CAN" || sStatus === "CANCELLED") return "Cancelled";
			if (sStatus === "C"   || sStatus === "CLOSED")    return "Closed";
			
			return "Pending";
		},

		_computePendingAt: function (oItem) {
			if (oItem.Status === "Pending") return "HOD";
			return "";
		}

	});
});
