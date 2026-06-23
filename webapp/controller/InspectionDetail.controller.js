sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.InspectionDetail", {

		onInit: function () {
			this.getRouter().getRoute("InspectionDetail").attachMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function () {
			// Read the row stored by InspectionList before navigation
			var oSrc = sap.ui.getCore().getModel("selectedInspEntry");
			if (!oSrc) {
				this.getRouter().navTo("InspectionList");
				return;
			}
			var oRaw = oSrc.getData();

			// Inspectiondate from backend arrives as YYYYMMDD or /Date(...)
			// Convert to yyyy-MM-dd so the DatePicker valueFormat="yyyy-MM-dd" can bind it
			var sInspDate = this._toYMD(oRaw.Inspectiondate || "");

			var oData = {
				GateEntryNo:       oRaw.GateEntryNo   || "",
				GEDateRaw:         oRaw.GEDateRaw      || "",   // YYYYMMDD — used as OData key
				GEDate:            oRaw.GEDate         || "",   // DD-MM-YYYY — display
				VendorDesc:        oRaw.VendorDesc      || "",
				SourceType:        oRaw.SourceType      || "",
				Department:        oRaw.Department      || "",
				DCNumber:          oRaw.DCNumber        || "",
				RGPNumber:         oRaw.RGPNumber       || "",
				RRNo:              oRaw.RRNo            || "",
				Plant:             oRaw.Plant           || "",
				BudgetCode:        oRaw.BudgetCode      || "",
				FirstItemDesc:     oRaw.FirstItemDesc   || "",
				RecievedQuantity:  oRaw.RecievedQuantity || "",
				UOM:               oRaw.UOM             || "",
				// editable
				Inspectiondate:    sInspDate,
				InspectionStatus:  oRaw.InspectionStatus || ""
			};

			var oModel = new JSONModel(oData);
			this.getView().setModel(oModel, "insp");
		},

		onSave: function () {
			var oModel   = this.getView().getModel("insp");
			var oData    = oModel.getData();
			var sGeNo    = oData.GateEntryNo;
			var sGeDateRaw = oData.GEDateRaw;   // YYYYMMDD

			if (!sGeNo) {
				MessageBox.error("Gate Entry No is missing.");
				return;
			}
			if (!oData.InspectionStatus) {
				MessageBox.warning("Please select an Inspection Status before saving.");
				return;
			}

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("SAP system is not connected.");
				return;
			}

			// Convert Inspectiondate from yyyy-MM-dd back to YYYYMMDD for the backend
			var sInspDateSAP = this._toSAPDate(oData.Inspectiondate || "");

			var oPayload = {
				InspectionStatus: oData.InspectionStatus,
				Inspectiondate:   sInspDateSAP
			};

			// OData key: GateEntryNo + GEDate (YYYYMMDD)
			var sKey = "/PCPHdrSet(GateEntryNo='" + sGeNo + "',GEDate='" + sGeDateRaw + "')";

			sap.ui.core.BusyIndicator.show(0);
			var that = this;

			oODataModel.refreshSecurityToken(function () {
				oODataModel.update(sKey, oPayload, {
					merge: true,
					success: function () {
						sap.ui.core.BusyIndicator.hide();
						// Update the shared model so the list reflects the new status immediately
						oModel.setProperty("/InspectionStatus", oData.InspectionStatus);
						oModel.setProperty("/Inspectiondate",   oData.Inspectiondate);
						MessageToast.show("Inspection details saved successfully.");
						setTimeout(function () { that.onNavBack(); }, 1200);
					},
					error: function (oError) {
						sap.ui.core.BusyIndicator.hide();
						var sMsg = "Failed to save inspection details.";
						try {
							var oBody = JSON.parse(oError.responseText);
							if (oBody.error && oBody.error.message && oBody.error.message.value) {
								sMsg = oBody.error.message.value;
							}
						} catch (e) {
							try {
								var oMatch = (oError.responseText || "").match(/<message[^>]*>([^<]+)<\/message>/i);
								if (oMatch && oMatch[1]) { sMsg = oMatch[1]; }
							} catch (e2) {}
						}
						MessageBox.error(sMsg + "\n\nGE No: " + sGeNo);
					}
				});
			}, function () {
				sap.ui.core.BusyIndicator.hide();
				MessageBox.error("Failed to refresh security token. Please reload the page.");
			});
		},

		// Convert any backend date format to yyyy-MM-dd for DatePicker
		_toYMD: function (vDate) {
			if (!vDate) { return ""; }
			// /Date(ms)/
			if (typeof vDate === "string" && vDate.indexOf("/Date(") === 0) {
				var ms = parseInt(vDate.replace(/\/Date\((\d+)[^)]*\)\//, "$1"), 10);
				vDate = new Date(ms);
			}
			// YYYYMMDD
			if (typeof vDate === "string" && /^\d{8}$/.test(vDate) && vDate !== "00000000") {
				return vDate.slice(0, 4) + "-" + vDate.slice(4, 6) + "-" + vDate.slice(6, 8);
			}
			if (vDate instanceof Date && !isNaN(vDate)) {
				return vDate.getFullYear() + "-" +
					String(vDate.getMonth() + 1).padStart(2, "0") + "-" +
					String(vDate.getDate()).padStart(2, "0");
			}
			// ISO already yyyy-MM-dd
			if (typeof vDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(vDate)) {
				return vDate.slice(0, 10);
			}
			return "";
		},

		// Convert yyyy-MM-dd → YYYYMMDD for SAP backend
		_toSAPDate: function (sDate) {
			if (!sDate) { return ""; }
			return sDate.replace(/-/g, "").slice(0, 8);
		},

		onNavBack: function () {
			this.getRouter().navTo("InspectionList");
		}

	});
});
