sap.ui.define([
	"zgpms/meilpower/com/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, FilterOperator, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("zgpms.meilpower.com.controller.AddInwardInsurance", {

		onInit: function () {
			this._resetModel();
			this.getRouter().getRoute("AddInwardInsurance").attachPatternMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			this._resetModel();
			this._loadVendors();

			var oArgs = oEvent.getParameter("arguments");
			var sInvoiceNo = oArgs.invoiceNo;

			if (sInvoiceNo) {
				var oModel = this.getView().getModel("ins");
				var oCoreModel = sap.ui.getCore().getModel("selectedInwardInsurance");
				if (oCoreModel) {
					var oData = oCoreModel.getData();
					sap.ui.getCore().setModel(null, "selectedInwardInsurance");

					var formatDate = function (vDate) {
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
					};

					oModel.setData({
						InvoiceNo:       oData.InvoiceNumber || "",
						InsuranceDate:   formatDate(oData.InsuranceDate),
						ReceivedDate:    formatDate(oData.RecievedDate),
						VendorCode:      "",
						VendorName:      oData.VendorName || "",
						VendorAddress:   oData.VendorAddress || "",
						ModeOfTransport: oData.ModeOfTransport || "",
						LRNumber:        oData.LRNumber || "",
						VehicleNo:       oData.VehicleNo || "",
						InvoiceValue:    oData.InvoiceValue || "",
						RgpDescription:  oData.RGPCoomonDesc || "",
						isReadOnly:      true
					});
				}
			}
		},

		_resetModel: function () {
			var sToday = new Date().toLocaleDateString("en-GB").split("/").join("-");
			var oModel = new JSONModel({
				InvoiceNo:       "",
				InsuranceDate:   sToday,
				ReceivedDate:    sToday,
				VendorCode:      "",
				VendorName:      "",
				VendorAddress:   "",
				ModeOfTransport: "Road",
				LRNumber:        "",
				VehicleNo:       "",
				InvoiceValue:    "",
				RgpDescription:  "",
				isReadOnly:      false
			});
			this.getView().setModel(oModel, "ins");
		},

		_loadVendors: function () {
			var oVendorModel = new JSONModel({ results: [] });
			this.getView().setModel(oVendorModel, "vendors");

			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) { return; }

			// Try to get plant from user model for filtering
			var oUserModel = sap.ui.getCore().getModel("user");
			var sPlant = oUserModel ? (oUserModel.getProperty("/plant") || oUserModel.getProperty("/Plant") || "") : "";

			var aFilters = sPlant ? [new Filter("Plant", FilterOperator.EQ, sPlant)] : [];

			oODataModel.read("/ZVendorSet", {
				filters: aFilters,
				success: function (oData) {
					var aResults = (oData.results || []).map(function (v) {
						return {
							Vendor:      v.Vendor      || v.Lifnr  || "",
							VendorName:  v.Name        || v.VendorName || v.Name1 || "Unknown Vendor",
							VendorGST:   v.VendorGST   || v.TaxNumber1 || "",
							Street:      v.Address     || v.Street || "",
							City:        v.City        || "",
							PostalCode:  v.ZipCode     || v.PostalCode || ""
						};
					});
					oVendorModel.setProperty("/results", aResults);
				},
				error: function () {
					// silently fail – vendor dropdown will just be empty
				}
			});
		},

		onVendorSelect: function (oEvent) {
			var sKey    = oEvent.getParameter("selectedItem").getKey();
			var oVModel = this.getView().getModel("vendors");
			var aVend   = oVModel ? (oVModel.getProperty("/results") || []) : [];
			var oVendor = aVend.find(function (v) { return v.Vendor === sKey; });

			var oInsModel = this.getView().getModel("ins");
			if (oVendor) {
				oInsModel.setProperty("/VendorName", oVendor.VendorName || "");
				var sParts = [oVendor.Street, oVendor.City, oVendor.PostalCode].filter(Boolean).join(", ");
				oInsModel.setProperty("/VendorAddress", sParts);
			} else {
				oInsModel.setProperty("/VendorName", "");
				oInsModel.setProperty("/VendorAddress", "");
			}
		},

		onSubmit: function () {
			var oInsModel = this.getView().getModel("ins");
			var oData     = oInsModel.getData();

			// Validation
			if (!oData.InvoiceNo || !oData.InvoiceNo.trim()) {
				MessageBox.error("Please enter Invoice / RGP No.");
				return;
			}
			if (!oData.InsuranceDate || !oData.InsuranceDate.trim()) {
				MessageBox.error("Please select Insurance Date.");
				return;
			}

			// Build payload matching OutGatePassSet insurance fields
			var oODataModel = this.getOwnerComponent().getModel();
			if (!oODataModel) {
				MessageBox.error("OData model not available.");
				return;
			}

			// Convert dd-MM-yyyy -> yyyyMMdd for SAP date fields
			var fnToSAPDate = function (sDDMMYYYY) {
				if (!sDDMMYYYY) { return ""; }
				var p = sDDMMYYYY.split("-");
				return (p.length === 3) ? (p[2] + p[1] + p[0]) : sDDMMYYYY;
			};

			var oPayload = {
				InvoiceNumber:   oData.InvoiceNo.trim(),
				InsuranceDate:   fnToSAPDate(oData.InsuranceDate),
				RecievedDate:    fnToSAPDate(oData.ReceivedDate),
				VendorName:      oData.VendorName || "",
				VendorAddress:   oData.VendorAddress || "",
				ModeOfTransport: oData.ModeOfTransport || "",
				LRNumber:        oData.LRNumber || "",
				VehicleNo:       oData.VehicleNo || "",
				InvoiceValue:    oData.InvoiceValue || "0",
				RGPCoomonDesc:   oData.RgpDescription || "",
				Message:         ""
			};

			sap.ui.core.BusyIndicator.show(0);
			oODataModel.create("/ZInwardInsuranceSet", oPayload, {
				success: function (oResponse) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = oResponse.Message || "Insurance details submitted successfully!";
					MessageBox.success(sMsg, {
						onClose: function () {
							this._resetModel();
						}.bind(this)
					});
				}.bind(this),
				error: function (oError) {
					sap.ui.core.BusyIndicator.hide();
					var sMsg = "";
					try { sMsg = JSON.parse(oError.responseText).error.message.value; } catch (e) { sMsg = oError.message || "Unknown error"; }
					MessageBox.error("Failed to submit insurance details:\n" + sMsg);
				}
			});
		},

		onNavBack: function () {
			this.getRouter().navTo("home");
		}

	});
});
